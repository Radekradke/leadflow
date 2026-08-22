import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  Check,
  Minus,
  ShieldCheck,
  FolderTree,
  Plus,
  Users,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeleton';
import { Field, Modal } from '../components/ui';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { AVAILABILITY } from '../lib/labels';
import { passwordPolicy, useZodForm } from '../lib/forms';
import { z } from 'zod';
import {
  ROLE_LABELS,
  type AdminUser,
  type BrokerProfile,
  type Department,
  type Paginated,
  type RoleType,
  type Team,
} from '../lib/types';

type Tab = 'users' | 'teams' | 'brokers' | 'roles';
const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'teams', label: 'Equipes', icon: UsersRound },
  { id: 'brokers', label: 'Corretores', icon: ArrowRightLeft },
  { id: 'roles', label: 'Perfis', icon: ShieldCheck },
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon size={15} strokeWidth={2} /> {label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'brokers' && <BrokersTab />}
      {tab === 'roles' && <RolesTab />}
    </div>
  );
}

// ── Usuários ──────────────────────────────────────────────
const ROLE_TYPES: RoleType[] = ['ADMIN', 'SALES_MANAGER', 'COORDINATOR', 'BROKER', 'ATTENDANT', 'QUEUE_SUPERVISOR', 'VIEWER'];

function UsersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<Paginated<AdminUser>>('/users?page=1&pageSize=100'),
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}/active`, { isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Usuário atualizado'); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setCreating(true)}>
          <UserPlus size={14} /> Novo usuário
        </button>
      </div>
      <div className="card overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : data?.items.length ? (
          <table className="w-full">
            <thead><tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">E-mail</th>
              <th className="px-4 py-3 font-semibold">Papel</th>
              <th className="px-4 py-3 font-semibold">Ativo</th>
            </tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="border-b border-line transition-colors last:border-0 hover:bg-paper/60">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="hidden px-4 py-3 text-sm text-muted md:table-cell">{u.email}</td>
                  <td className="px-4 py-3 text-sm">{ROLE_LABELS[u.role.type]}</td>
                  <td className="px-4 py-3">
                    <button
                      className={`pill transition-colors ${u.isActive ? 'bg-accent-50 text-accent-600' : 'bg-red-50 text-red-700'}`}
                      onClick={() => toggle.mutate({ id: u.id, isActive: !u.isActive })}
                      title={u.isActive ? 'Clique para desativar' : 'Clique para ativar'}
                    >
                      {u.isActive ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum usuário cadastrado"
            description="Crie o primeiro usuário da operação — corretores, atendentes ou gestores."
            action={<button className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setCreating(true)}><UserPlus size={14} /> Novo usuário</button>}
          />
        )}
      </div>
      {creating && <NewUserModal onClose={() => setCreating(false)} />}
    </div>
  );
}

const newUserSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: passwordPolicy,
  roleType: z.string().min(1),
});

function NewUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useZodForm(newUserSchema, { name: '', email: '', password: '', roleType: 'BROKER' });
  const m = useMutation({
    mutationFn: (data: z.infer<typeof newUserSchema>) => api.post('/users', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Usuário criado'); onClose(); },
    onError: (e: Error) => toast(e.message),
  });

  function submit() {
    const data = form.validate();
    if (data) m.mutate(data);
  }

  return (
    <Modal title="Novo usuário" onClose={onClose}>
      <Field label="Nome" error={form.errors.name}>
        <input className={`input ${form.errors.name ? 'input-error' : ''}`} value={form.values.name}
          onChange={(e) => form.set('name', e.target.value)} onBlur={() => form.blur('name')} />
      </Field>
      <Field label="E-mail" error={form.errors.email}>
        <input className={`input ${form.errors.email ? 'input-error' : ''}`} type="email" value={form.values.email}
          onChange={(e) => form.set('email', e.target.value)} onBlur={() => form.blur('email')} />
      </Field>
      <Field label="Senha inicial" error={form.errors.password} hint="Mín. 8 caracteres, com letra e número. O usuário poderá trocar depois.">
        <input className={`input ${form.errors.password ? 'input-error' : ''}`} type="password" value={form.values.password}
          onChange={(e) => form.set('password', e.target.value)} onBlur={() => form.blur('password')} />
      </Field>
      <Field label="Papel">
        <select className="input" value={form.values.roleType} onChange={(e) => form.set('roleType', e.target.value)}>
          {ROLE_TYPES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm" disabled={!form.isValid || m.isPending} onClick={submit}>
          {m.isPending ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </Modal>
  );
}

// ── Equipes ──────────────────────────────────────────────
function TeamsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get<Team[]>('/teams') });
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments') });
  const [newDept, setNewDept] = useState('');
  const [newTeam, setNewTeam] = useState({ name: '', departmentId: '' });

  const createDept = useMutation({
    mutationFn: () => api.post('/departments', { name: newDept }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setNewDept(''); toast('Departamento criado'); },
    onError: (e: Error) => toast(e.message),
  });
  const createTeam = useMutation({
    mutationFn: () => api.post('/teams', newTeam),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setNewTeam({ name: '', departmentId: '' }); toast('Equipe criada'); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Departamentos */}
      <div className="card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Building2 size={15} className="text-muted" /> Departamentos
        </h3>
        <div className="mb-4 flex gap-2">
          <input className="input" placeholder="Novo departamento" value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newDept.trim()) createDept.mutate(); }} />
          <button className="btn-primary btn-sm flex-shrink-0" disabled={!newDept.trim() || createDept.isPending} onClick={() => createDept.mutate()}>
            <Plus size={15} />
          </button>
        </div>
        {depts.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>
        ) : depts.data?.length ? (
          <ul className="divide-y divide-line">
            {depts.data.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{d.name}</span>
                <span className="font-mono text-2xs text-muted">{d._count?.teams ?? 0} equipes</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Nenhum departamento ainda.</p>
        )}
      </div>

      {/* Equipes */}
      <div className="card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FolderTree size={15} className="text-muted" /> Equipes
        </h3>
        <div className="mb-4 space-y-2">
          <input className="input" placeholder="Nome da equipe" value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={newTeam.departmentId} onChange={(e) => setNewTeam({ ...newTeam, departmentId: e.target.value })}>
              <option value="">Departamento…</option>
              {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn-primary btn-sm flex-shrink-0" disabled={!newTeam.name.trim() || !newTeam.departmentId || createTeam.isPending} onClick={() => createTeam.mutate()}>
              <Plus size={15} />
            </button>
          </div>
        </div>
        {teams.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>
        ) : teams.data?.length ? (
          <ul className="divide-y divide-line">
            {teams.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-2xs text-muted">{t.department?.name} · {t._count?.members ?? 0} membros</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Crie um departamento e depois adicione equipes.</p>
        )}
      </div>
    </div>
  );
}

// ── Corretores ───────────────────────────────────────────
function BrokersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [redistrib, setRedistrib] = useState<BrokerProfile | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['brokers'], queryFn: () => api.get<BrokerProfile[]>('/brokers') });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/brokers/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['brokers'] }); toast('Corretor atualizado'); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <div className="card overflow-hidden">
      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : data?.length ? (
        <table className="w-full">
          <thead><tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-semibold">Corretor</th>
            <th className="px-4 py-3 font-semibold">Disponibilidade</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Capacidade</th>
            <th className="px-4 py-3 font-semibold">Distribuição</th>
            <th className="px-4 py-3 font-semibold"></th>
          </tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id} className="border-b border-line transition-colors last:border-0 hover:bg-paper/60">
                <td className="px-4 py-3"><div className="font-medium">{b.user.name}</div><div className="text-2xs text-muted">{b.user.email}</div></td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full" style={{ background: AVAILABILITY[b.availability].color }} />
                    {AVAILABILITY[b.availability].label}
                  </span>
                </td>
                <td className="hidden px-4 py-3 font-mono text-sm md:table-cell">{b.maxActiveLeads}</td>
                <td className="px-4 py-3">
                  <button
                    className={`pill transition-colors ${b.acceptsDistribution ? 'bg-accent-50 text-accent-600' : 'bg-paper text-muted'}`}
                    onClick={() => update.mutate({ id: b.id, body: { acceptsDistribution: !b.acceptsDistribution } })}
                    title={b.acceptsDistribution ? 'Pausar recebimento' : 'Voltar a receber'}
                  >
                    {b.acceptsDistribution ? 'Recebe' : 'Pausado'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-ghost btn-sm inline-flex items-center gap-1.5" onClick={() => setRedistrib(b)}>
                    <ArrowRightLeft size={14} /> Redistribuir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState
          icon={Users}
          title="Nenhum corretor"
          description="Crie usuários com o papel “Corretor” na aba Usuários — eles aparecem aqui automaticamente com perfil de distribuição."
        />
      )}
      {redistrib && <RedistributeModal broker={redistrib} onClose={() => setRedistrib(null)} />}
    </div>
  );
}

function RedistributeModal({ broker, onClose }: { broker: BrokerProfile; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [toQueueId, setToQueueId] = useState('');
  const [auto, setAuto] = useState(true);
  const queues = useQuery({ queryKey: ['queues'], queryFn: () => api.get<QueueLite[]>('/queues') });

  const m = useMutation({
    mutationFn: () =>
      api.post<{ redistributed: number; autoDistributed?: number }>(`/brokers/${broker.id}/redistribute`, {
        reason,
        toQueueId: toQueueId || undefined,
        autoDistribute: auto,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['brokers'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast(`${r.redistributed} lead(s) redistribuído(s)${r.autoDistributed != null ? ` · ${r.autoDistributed} já atribuídos` : ''}`);
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <Modal title={`Redistribuir carteira — ${broker.user.name}`} onClose={onClose}>
      <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
        Encerra todas as atribuições ativas deste corretor e devolve os leads à fila. Use quando ele sair, for desligado ou entrar de férias.
      </p>
      <Field label="Fila de destino (opcional)">
        <select className="input" value={toQueueId} onChange={(e) => setToQueueId(e.target.value)}>
          <option value="">— manter a fila atual de cada lead —</option>
          {queues.data?.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      </Field>
      <Field label="Motivo (obrigatório)">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: desligamento, férias…" />
      </Field>
      <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 rounded border-line2 text-accent focus:ring-accent" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        Já redistribuir automaticamente para outros corretores
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm inline-flex items-center gap-1.5" disabled={!reason.trim() || m.isPending} onClick={() => m.mutate()}>
          <ArrowRightLeft size={14} /> {m.isPending ? 'Redistribuindo…' : 'Redistribuir'}
        </button>
      </div>
    </Modal>
  );
}


// ── Perfis (matriz de acesso, somente leitura) ───────────
// Espelha src/common/rbac/permissions.ts (ROLE_TEMPLATES) + ROLES.md.
// Referência visual para o gestor; a regra que VALE é a do backend.
const ROLE_COLS: { key: string; label: string }[] = [
  { key: 'ADMIN', label: 'Admin' },
  { key: 'SALES_MANAGER', label: 'Gestor' },
  { key: 'COORDINATOR', label: 'Coord.' },
  { key: 'BROKER', label: 'Corretor' },
  { key: 'ATTENDANT', label: 'Atend.' },
  { key: 'QUEUE_SUPERVISOR', label: 'Superv.' },
  { key: 'VIEWER', label: 'Visual.' },
];

// true = tem acesso. Ordem das colunas igual a ROLE_COLS.
const CAP_ROWS: { label: string; highlight?: boolean; on: boolean[] }[] = [
  { label: 'Ver leads',               on: [1,1,1,1,1,1,1].map(Boolean) },
  { label: 'Ver CPF / renda (simulação)', highlight: true, on: [1,1,1,1,1,0,0].map(Boolean) },
  { label: 'Ver telefone / WhatsApp', highlight: true, on: [1,1,1,0,1,1,0].map(Boolean) },
  { label: 'Cadastrar lead',          on: [1,1,1,1,1,0,0].map(Boolean) },
  { label: 'Editar / mudar status',   on: [1,1,1,1,1,0,0].map(Boolean) },
  { label: 'Transferir lead',         on: [1,1,1,1,0,1,0].map(Boolean) },
  { label: 'Arquivar / perder',       on: [1,1,1,1,0,0,0].map(Boolean) },
  { label: 'Configurar distribuição', on: [1,1,0,0,0,1,0].map(Boolean) },
  { label: 'Distribuir manualmente',  on: [1,1,1,0,1,1,0].map(Boolean) },
  { label: 'Gerenciar filas',         on: [1,1,0,0,0,1,0].map(Boolean) },
  { label: 'Gerenciar equipes',       on: [1,1,0,0,0,0,0].map(Boolean) },
  { label: 'Criar / editar usuários', on: [1,0,0,0,0,0,0].map(Boolean) },
  { label: 'Painel gerencial',        on: [1,1,1,0,0,1,0].map(Boolean) },
  { label: 'Auditoria',               on: [1,1,0,0,0,1,0].map(Boolean) },
];

const ROLE_DESC: Record<string, string> = {
  ADMIN: 'Dono da imobiliária. Acesso total dentro do tenant.',
  SALES_MANAGER: 'Chefe da operação comercial. Funil geral, relatórios, distribuição.',
  COORDINATOR: 'Chefe de uma equipe. Vê os leads e corretores da sua equipe.',
  BROKER: 'Atende os próprios leads. Vê CPF (simulação), mas não o telefone.',
  ATTENDANT: 'Cadastra e qualifica leads; faz o primeiro contato.',
  QUEUE_SUPERVISOR: 'Cuida das filas e das regras de distribuição.',
  VIEWER: 'Somente leitura — sócio, contabilidade, auditoria.',
};

function RolesTab() {
  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_COLS.map((r) => (
          <div key={r.key} className="card p-3.5">
            <p className="text-sm font-semibold">{r.label === 'Admin' ? 'Administrador' : r.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{ROLE_DESC[r.key]}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="th sticky left-0 bg-surface text-left">Capacidade</th>
              {ROLE_COLS.map((r) => (
                <th key={r.key} className="th text-center">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAP_ROWS.map((row) => (
              <tr key={row.label} className={`border-b border-line last:border-0 ${row.highlight ? 'bg-accent-50/40' : ''}`}>
                <td className={`td sticky left-0 ${row.highlight ? 'bg-accent-50/40' : 'bg-surface'} font-medium`}>{row.label}</td>
                {row.on.map((has, i) => (
                  <td key={i} className="td text-center">
                    {has
                      ? <Check size={15} className="mx-auto text-accent-600" strokeWidth={2.5} />
                      : <Minus size={14} className="mx-auto text-line2" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Referência visual. A regra aplicada de fato é a do servidor
        (<span className="font-mono">permissions.ts</span>). As linhas destacadas são as de dado sensível:
        o corretor vê o CPF para simulação, mas o telefone fica mascarado.
      </p>
    </div>
  );
}

interface QueueLite { id: string; name: string }
