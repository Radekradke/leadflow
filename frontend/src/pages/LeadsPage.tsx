import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import EmptyState from '../components/EmptyState';
import LeadDetailDrawer from '../components/LeadDetailDrawer';
import { TableSkeleton } from '../components/Skeleton';
import StatusPill from '../components/StatusPill';
import { Field, Modal } from '../components/ui';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relDate } from '../lib/format';
import { LEAD_STATUS_META, type Lead, type Paginated, type Queue } from '../lib/types';
import { useZodForm } from '../lib/forms';
import { z } from 'zod';

const ORIGINS = ['META_ADS', 'GOOGLE_ADS', 'WEBSITE', 'REFERRAL', 'PORTAL', 'WHATSAPP', 'OTHER'];
const ORIGIN_LABELS: Record<string, string> = {
  META_ADS: 'Meta Ads', GOOGLE_ADS: 'Google Ads', WEBSITE: 'Site', REFERRAL: 'Indicação',
  PORTAL: 'Portal', WHATSAPP: 'WhatsApp', OTHER: 'Outro',
};

function avatarColor(name: string) {
  const colors = ['#0E7C66', '#1d4ed8', '#6d28d9', '#b45309', '#be123c', '#0f766e'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}
function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function LeadsPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const pageSize = 20;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set('search', search.trim());
  if (status) params.set('status', status);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { page, search, status }],
    queryFn: () => api.get<Paginated<Lead>>(`/leads?${params.toString()}`),
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input w-72 pl-9"
            placeholder="Buscar nome, telefone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos os status</option>
          {Object.entries(LEAD_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex-1" />
        {can('lead:create') && (
          <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Novo lead</button>
        )}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : data?.items.length ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Lead</th>
                <th className="th hidden md:table-cell">CPF</th>
                <th className="th hidden lg:table-cell">Origem</th>
                <th className="th">Status</th>
                <th className="th hidden md:table-cell">Último contato</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper"
                  onClick={() => setSelected(l)}
                >
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-2xs font-semibold text-white"
                        style={{ background: avatarColor(l.name) }}
                      >
                        {initials(l.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">{l.name}</div>
                        <div className="font-mono text-2xs text-muted">{l.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td hidden font-mono text-xs text-muted md:table-cell">{l.cpf ?? '—'}</td>
                  <td className="td hidden text-muted lg:table-cell">{ORIGIN_LABELS[l.origin] ?? l.origin}</td>
                  <td className="td"><StatusPill status={l.status} /></td>
                  <td className="td hidden text-xs text-muted md:table-cell">{relDate(l.lastContactAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum lead encontrado"
            description={search || status ? 'Tente ajustar a busca ou os filtros.' : 'Os leads aparecerão aqui assim que chegarem.'}
            action={can('lead:create') ? <button className="btn-primary btn-sm" onClick={() => setCreating(true)}><Plus size={15} /> Novo lead</button> : undefined}
          />
        )}
      </div>

      {data && data.total > pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span><span className="font-mono text-ink">{data.total}</span> leads</span>
          <div className="flex items-center gap-1">
            <button className="btn-icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={18} /></button>
            <span className="px-2 font-mono text-xs">{page} / {totalPages}</span>
            <button className="btn-icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={18} /></button>
          </div>
        </div>
      )}

      {selected && <LeadDetailDrawer lead={selected} onClose={() => setSelected(null)} />}
      {creating && <NewLeadModal onClose={() => setCreating(false)} />}
    </div>
  );
}

const newLeadSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do lead'),
  phone: z.string().trim().min(8, 'Telefone muito curto'),
  cityOfInterest: z.string().trim().optional(),
  origin: z.string().min(1),
  currentQueueId: z.string().optional(),
});

function NewLeadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useZodForm(newLeadSchema, { name: '', phone: '', cityOfInterest: '', origin: 'META_ADS', currentQueueId: '' });
  const queues = useQuery({ queryKey: ['queues'], queryFn: () => api.get<Queue[]>('/queues') });

  const m = useMutation({
    mutationFn: (data: z.infer<typeof newLeadSchema>) =>
      api.post('/leads', {
        name: data.name, phone: data.phone,
        cityOfInterest: data.cityOfInterest || undefined,
        origin: data.origin,
        currentQueueId: data.currentQueueId || undefined,
      }),
    onSuccess: (_r, data) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast(data.currentQueueId ? 'Lead criado — distribuição automática disparada' : 'Lead criado');
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  function submit() {
    const data = form.validate();
    if (data) m.mutate(data);
  }

  return (
    <Modal title="Novo lead" onClose={onClose}>
      <Field label="Nome" error={form.errors.name}>
        <input className={`input ${form.errors.name ? 'input-error' : ''}`} value={form.values.name}
          onChange={(e) => form.set('name', e.target.value)} onBlur={() => form.blur('name')} placeholder="Nome do cliente" />
      </Field>
      <Field label="Telefone" error={form.errors.phone}>
        <input className={`input ${form.errors.phone ? 'input-error' : ''}`} value={form.values.phone}
          onChange={(e) => form.set('phone', e.target.value)} onBlur={() => form.blur('phone')} placeholder="(21) 9...." />
      </Field>
      <Field label="Cidade de interesse">
        <input className="input" value={form.values.cityOfInterest} onChange={(e) => form.set('cityOfInterest', e.target.value)} />
      </Field>
      <Field label="Origem">
        <select className="input" value={form.values.origin} onChange={(e) => form.set('origin', e.target.value)}>
          {ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}
        </select>
      </Field>
      <Field label="Fila de entrada" hint="Se a fila tiver distribuição automática, o lead já cai num corretor.">
        <select className="input" value={form.values.currentQueueId} onChange={(e) => form.set('currentQueueId', e.target.value)}>
          <option value="">— sem fila —</option>
          {queues.data?.map((q) => <option key={q.id} value={q.id}>{q.name}{q.distributionEnabled ? ' · auto' : ''}</option>)}
        </select>
      </Field>
      <div className="mt-1 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm" disabled={!form.isValid || m.isPending} onClick={submit}>Criar lead</button>
      </div>
    </Modal>
  );
}
