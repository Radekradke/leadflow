import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Briefcase, CheckCircle2, Inbox, ListTodo, TrendingUp, UserX,
} from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CardsSkeleton } from '../components/Skeleton';
import StatCard from '../components/StatCard';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { LEAD_STATUS_META, type LeadStatus } from '../lib/types';

interface OperationalDash {
  isBroker: boolean;
  availability?: string;
  portfolio: { activeCount: number; capacity: number; utilization: number; byStatus: Record<string, number>; stale: number; noResponse: number; inService: number; closed: number } | null;
  tasks: { pending: number; overdue: number; dueToday: number };
}
interface ManagementDash {
  leadsByStatus: Record<string, number>;
  awaitingDistribution: { queueId: string | null; queueName: string; count: number }[];
  brokerLoad: { brokerProfileId: string; name: string; activeCount: number; capacity: number; utilization: number }[];
  distributionLast7Days: Record<string, number>;
  conversion: { resolved: number; lost: number; rate: number | null };
  intake: { today: number; last7Days: number; last30Days: number };
  staleLeads: number;
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {user?.name?.split(' ')[0] ?? 'bem-vindo'}
        </h1>
        <p className="mt-0.5 text-sm text-muted">Sua operação em um relance.</p>
      </header>
      {can('dashboard:operational') && <Operational />}
      {can('dashboard:management') && <Management />}
    </div>
  );
}

function Operational() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'operational'],
    queryFn: () => api.get<OperationalDash>('/dashboard/operational'),
  });
  if (isLoading) return <Section title="Minha operação"><CardsSkeleton /></Section>;
  if (isError || !data) return <LoadError />;

  return (
    <Section title="Minha operação">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.portfolio ? (
          <>
            <StatCard icon={Briefcase} label="Em atendimento" value={data.portfolio.inService}
              hint={`${data.portfolio.activeCount} na carteira · ${data.portfolio.utilization}% de ${data.portfolio.capacity}`} />
            <StatCard icon={UserX} label="Sem resposta" value={data.portfolio.noResponse}
              hint="aguardando retorno do cliente" tone={data.portfolio.noResponse > 0 ? 'warn' : 'default'} />
            <StatCard icon={CheckCircle2} label="Encerrados" value={data.portfolio.closed}
              hint="convertidos, perdidos ou arquivados" />
          </>
        ) : (
          <div className="card col-span-2 flex items-center p-4 text-sm text-muted lg:col-span-3">
            Você não tem carteira de corretor. As tarefas continuam valendo.
          </div>
        )}
        <StatCard icon={ListTodo} label="Tarefas hoje" value={data.tasks.dueToday}
          hint={`${data.tasks.overdue} atrasadas · ${data.tasks.pending} pendentes`}
          tone={data.tasks.overdue > 0 ? 'warn' : 'default'} />
      </div>
    </Section>
  );
}

function Management() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'management'],
    queryFn: () => api.get<ManagementDash>('/dashboard/management'),
  });
  if (isLoading) return <Section title="Visão gerencial"><CardsSkeleton /></Section>;
  if (isError || !data) return <LoadError />;

  const funnel = Object.entries(data.leadsByStatus)
    .map(([status, count]) => ({ status: status as LeadStatus, label: LEAD_STATUS_META[status as LeadStatus]?.label ?? status, count }))
    .sort((a, b) => b.count - a.count);
  const awaitingTotal = data.awaitingDistribution.reduce((s, q) => s + q.count, 0);

  return (
    <Section title="Visão gerencial">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Inbox} label="Aguardando" value={awaitingTotal} hint="na fila de distribuição"
          tone={awaitingTotal > 0 ? 'warn' : 'default'} />
        <StatCard icon={AlertTriangle} label="Leads parados" value={data.staleLeads}
          tone={data.staleLeads > 0 ? 'warn' : 'default'} />
        <StatCard icon={TrendingUp} label="Conversão"
          value={data.conversion.rate === null ? '—' : `${data.conversion.rate}%`}
          hint={`${data.conversion.resolved} ganhos · ${data.conversion.lost} perdidos`} tone="good" />
        <StatCard icon={CheckCircle2} label="Novos (7 dias)" value={data.intake.last7Days}
          hint={`${data.intake.today} hoje`} />
      </div>

      <div className="card mt-3 p-5">
        <p className="mb-4 text-sm font-medium">Leads por status</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={128}
                tick={{ fontSize: 12, fill: '#6B7382' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#F6F5F2' }}
                contentStyle={{ borderRadius: 12, border: '1px solid #E8E6E1', fontSize: 12, boxShadow: '0 8px 24px rgba(13,17,23,0.1)' }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                {funnel.map((f) => <Cell key={f.status} fill="#0E7C66" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.brokerLoad.length > 0 && (
        <div className="card mt-3 overflow-hidden">
          <p className="border-b border-line px-5 py-3.5 text-sm font-medium">Carga por corretor</p>
          <div className="divide-y divide-line">
            {data.brokerLoad.map((b) => (
              <div key={b.brokerProfileId} className="flex items-center gap-3 px-5 py-3">
                <span className="w-36 truncate text-sm">{b.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                  <div className={`h-full rounded-full transition-all ${b.utilization >= 90 ? 'bg-amber-500' : 'bg-accent'}`}
                    style={{ width: `${Math.min(b.utilization, 100)}%` }} />
                </div>
                <span className="w-16 text-right font-mono text-2xs text-muted">{b.activeCount}/{b.capacity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="section-label">{title}</p>
      {children}
    </section>
  );
}
function LoadError() {
  return <div className="card p-4 text-sm text-muted">Não foi possível carregar os dados. Recarregue a página.</div>;
}
