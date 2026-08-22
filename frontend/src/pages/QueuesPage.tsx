import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  GitBranch,
  Megaphone,
  Trash2,
  Inbox,
  Layers,
  Plus,
  UserMinus,
  UserPlus,
  Users,
  Zap,
  ZapOff,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { Drawer, Field, KV, Modal } from '../components/ui';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { AVAILABILITY, DIST_RESULT, STRATEGIES } from '../lib/labels';
import type { BrokerProfile, DistributionLog, Queue, QueueMember } from '../lib/types';

export default function QueuesPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState<Queue | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['queues'], queryFn: () => api.get<Queue[]>('/queues') });
  const canConfig = can('distribution:configure');
  const canManage = can('queue:manage');

  // Monta a árvore: filas sem pai no topo; as filhas penduradas nelas.
  const all = data ?? [];
  const roots = all.filter((q) => !q.parentId);
  const childrenOf = (id: string) => all.filter((q) => q.parentId === id);

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-3 p-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        ))
      ) : all.length ? (
        <>
          {canManage && (
            <div className="flex justify-end">
              <button className="btn-ghost btn-sm" onClick={() => setCreating(true)}>
                <Plus size={15} /> Nova fila
              </button>
            </div>
          )}
          {roots.map((q) => {
            const filhos = childrenOf(q.id);
            return filhos.length > 0 ? (
              <RegionalCard
                key={q.id}
                regional={q}
                filhos={filhos}
                canConfig={canConfig}
                onOpen={setOpen}
              />
            ) : (
              <QueueCard key={q.id} queue={q} canConfig={canConfig} onOpen={() => setOpen(q)} />
            );
          })}
          {canManage && <AdRoutesCard queues={all} />}
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon={Inbox}
            title="Nenhuma fila cadastrada"
            description="As filas organizam a entrada de leads e definem como eles são distribuídos entre os corretores."
          />
        </div>
      )}
      {open && <QueueDrawer queue={open} canConfig={canConfig} canManage={canManage} onClose={() => setOpen(null)} />}
      {creating && <CreateQueueModal queues={all} onClose={() => setCreating(false)} />}
    </div>
  );
}

function QueueCard({ queue, canConfig, onOpen }: { queue: Queue; canConfig: boolean; onOpen: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const config = useMutation({
    mutationFn: (body: { strategy?: string; enabled?: boolean }) =>
      api.patch(`/distribution/queues/${queue.id}/config`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['queues'] }); toast('Distribuição atualizada'); },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <div className="card card-interactive p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${queue.isActive ? 'bg-accent-50 text-accent-600' : 'bg-paper text-muted'}`}>
            <Layers size={18} strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{queue.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${queue.isActive ? 'bg-accent' : 'bg-line2'}`} />
              {queue.isActive ? 'Ativa' : 'Inativa'} · {STRATEGIES[queue.distributionStrategy]}
            </span>
          </span>
        </button>

        {canConfig && (
          <div className="flex items-center gap-2">
            <select
              className="input h-9 w-auto py-0 text-xs"
              value={queue.distributionStrategy}
              onChange={(e) => config.mutate({ strategy: e.target.value })}
              title="Estratégia de distribuição"
            >
              {Object.entries(STRATEGIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button
              className={`btn-sm inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                queue.distributionEnabled
                  ? 'border-accent-100 bg-accent-50 text-accent-600'
                  : 'border-line bg-paper text-muted hover:text-ink'
              }`}
              onClick={() => config.mutate({ enabled: !queue.distributionEnabled })}
              title="Liga/desliga a distribuição automática"
            >
              {queue.distributionEnabled ? <Zap size={13} /> : <ZapOff size={13} />}
              {queue.distributionEnabled ? 'Auto ligada' : 'Auto desligada'}
            </button>
          </div>
        )}
        <button className="btn-ghost btn-sm" onClick={onOpen}>Detalhes</button>
      </div>
    </div>
  );
}


// ── Regional: fila que reparte entre as filas dos gerentes ──────
// A fila-pai não tem corretores; ela só decide para qual gerente vai o
// lead, conforme o peso. Os percentuais mostrados são relativos ao total
// dos pesos — então não é preciso fechar exatamente 100.
function RegionalCard({
  regional,
  filhos,
  canConfig,
  onOpen,
}: {
  regional: Queue;
  filhos: Queue[];
  canConfig: boolean;
  onOpen: (q: Queue) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  // Peso "ao vivo" enquanto arrasta, para a barra responder na hora.
  const [draft, setDraft] = useState<Record<string, number>>({});

  const setWeight = useMutation({
    mutationFn: ({ id, routingWeight }: { id: string; routingWeight: number }) =>
      api.patch(`/queues/${id}`, { routingWeight }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queues'] }),
    onError: (e: Error) => toast(e.message),
  });

  const pesoDe = (q: Queue) => draft[q.id] ?? q.routingWeight;
  const ativos = filhos.filter((f) => f.isActive && f.distributionEnabled);
  const total = ativos.reduce((soma, f) => soma + pesoDe(f), 0);
  const pct = (q: Queue) => {
    if (!q.isActive || !q.distributionEnabled || total === 0) return 0;
    return Math.round((pesoDe(q) / total) * 100);
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(regional)}>
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <GitBranch size={18} strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{regional.name}</span>
            <span className="mt-0.5 block text-xs text-muted">
              Regional · reparte entre {filhos.length} {filhos.length === 1 ? 'equipe' : 'equipes'}
            </span>
          </span>
        </button>
      </div>

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        {filhos.map((f) => {
          const inativo = !f.isActive || !f.distributionEnabled;
          return (
            <div key={f.id} className="flex items-center gap-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpen(f)}
                title="Ver corretores desta equipe"
              >
                <span className={`block truncate text-sm font-medium ${inativo ? 'text-muted' : 'text-ink'}`}>
                  {f.name}
                </span>
                <span className="text-2xs text-muted">
                  {inativo ? 'pausada — não recebe leads' : `${f.routedCount} leads recebidos`}
                </span>
              </button>

              {/* Barra de proporção, no espírito do FlowBuilder */}
              <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-paper sm:block">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${pct(f)}%` }}
                />
              </div>

              {canConfig ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pesoDe(f)}
                    disabled={inativo}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.id]: Number(e.target.value) }))}
                    onMouseUp={() => setWeight.mutate({ id: f.id, routingWeight: pesoDe(f) })}
                    onTouchEnd={() => setWeight.mutate({ id: f.id, routingWeight: pesoDe(f) })}
                    className="w-24 accent-accent disabled:opacity-40"
                    aria-label={`Peso de ${f.name}`}
                  />
                  <span className="w-11 text-right font-mono text-xs tabular-nums text-ink">
                    {pct(f)}%
                  </span>
                </div>
              ) : (
                <span className="w-11 text-right font-mono text-xs tabular-nums text-muted">
                  {pct(f)}%
                </span>
              )}
            </div>
          );
        })}

        <p className="text-2xs text-muted">
          A cada lead, o sistema escolhe a equipe respeitando esses percentuais e
          então sorteia o corretor pelo rodízio da equipe. Equipe sem corretor
          disponível é pulada.
        </p>
      </div>
    </div>
  );
}

// ── Criar fila (regional ou equipe pendurada num regional) ──────
function CreateQueueModal({ queues, onClose }: { queues: Queue[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/queues', {
        name: name.trim(),
        ...(parentId ? { parentId, routingWeight: 50 } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queues'] });
      toast(parentId ? 'Equipe adicionada ao regional' : 'Fila criada');
      onClose();
    },
    onError: (e: Error) => toast(e.message),
  });

  // Só filas raiz podem ser "pai" — mantém a configuração simples de ler.
  const possiveisPais = queues.filter((q) => !q.parentId);

  return (
    <Modal title="Nova fila" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Regional Nova Iguaçu ou Gerente Márcio"
          />
        </Field>
        <Field
          label="Pendurar em um regional"
          hint="Deixe em branco para criar um regional (que reparte) ou uma fila comum."
        >
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nenhum — fila de topo</option>
            {possiveisPais.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button
          className="btn-primary btn-sm"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar
        </button>
      </div>
    </Modal>
  );
}


// ── De qual anúncio veio → para qual fila vai ───────────────
// O lead que clica num anúncio do Facebook/Instagram chega com o ID do
// anúncio. Aqui o gestor diz para onde cada anúncio deve mandar o lead.
function AdRoutesCard({ queues }: { queues: Queue[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ adSourceId: '', label: '', queueId: '' });

  const rotas = useQuery({
    queryKey: ['ad-routes'],
    queryFn: () => api.get<AdRoute[]>('/queues/ad-routes/all'),
  });

  const salvar = useMutation({
    mutationFn: () =>
      api.post('/queues/ad-routes', {
        adSourceId: form.adSourceId.trim(),
        queueId: form.queueId,
        label: form.label.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-routes'] });
      toast('Anúncio direcionado');
      setForm({ adSourceId: '', label: '', queueId: '' });
      setAberto(false);
    },
    onError: (e: Error) => toast(e.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.del(`/queues/ad-routes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-routes'] });
      toast('Direcionamento removido');
    },
    onError: (e: Error) => toast(e.message),
  });

  const valido = form.adSourceId.trim() && form.queueId;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
          <Megaphone size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">De onde vem o lead</p>
          <p className="mt-0.5 text-xs text-muted">
            Direcione cada anúncio para uma fila diferente
          </p>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => setAberto(true)}>
          <Plus size={15} /> Direcionar anúncio
        </button>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {rotas.isLoading ? (
          <p className="text-xs text-muted">carregando…</p>
        ) : !rotas.data?.length ? (
          <p className="text-xs text-muted">
            Nenhum anúncio direcionado. Sem isso, todo lead do WhatsApp cai na
            fila padrão.
          </p>
        ) : (
          <div className="space-y-2">
            {rotas.data.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.label || `Anúncio ${r.adSourceId}`}
                  </p>
                  <p className="truncate font-mono text-2xs text-muted">ID {r.adSourceId}</p>
                </div>
                <span className="hidden text-xs text-muted sm:inline">→</span>
                <span className="max-w-[40%] truncate rounded-lg bg-paper px-2.5 py-1 text-xs font-medium text-ink">
                  {r.queue?.name ?? '—'}
                </span>
                <button
                  onClick={() => remover.mutate(r.id)}
                  className="text-muted transition hover:text-red-600"
                  aria-label="Remover"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {aberto && (
        <Modal title="Direcionar anúncio" onClose={() => setAberto(false)}>
          <p className="mb-4 text-xs text-muted">
            Pegue o <strong>ID do anúncio</strong> no Gerenciador de Anúncios da Meta
            (na coluna de identificação do anúncio). Todo lead que clicar nele vai
            direto para a fila escolhida.
          </p>
          <div className="space-y-3">
            <Field label="ID do anúncio (Meta)">
              <input
                className="input"
                value={form.adSourceId}
                onChange={(e) => setForm((f) => ({ ...f, adSourceId: e.target.value }))}
                placeholder="Ex: 120210000000000000"
              />
            </Field>
            <Field label="Apelido (opcional)" hint="Só para você reconhecer na lista.">
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Campanha Queimados"
              />
            </Field>
            <Field label="Mandar para">
              <select
                className="input"
                value={form.queueId}
                onChange={(e) => setForm((f) => ({ ...f, queueId: e.target.value }))}
              >
                <option value="">Escolha a fila…</option>
                {queues
                  .filter((q) => q.isActive)
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={!valido || salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QueueDrawer({ queue, canConfig, canManage, onClose }: { queue: Queue; canConfig: boolean; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState('');

  const members = useQuery({
    queryKey: ['queue', queue.id, 'members'],
    queryFn: () => api.get<QueueMember[]>(`/queues/${queue.id}/members`),
  });
  const allBrokers = useQuery({
    queryKey: ['brokers'],
    queryFn: () => api.get<BrokerProfile[]>('/brokers'),
    enabled: canManage,
  });
  const logs = useQuery({
    queryKey: ['queue', queue.id, 'logs'],
    queryFn: () => api.get<DistributionLog[]>(`/distribution/queues/${queue.id}/logs`),
    enabled: canConfig,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['queue', queue.id, 'members'] });
  const addMember = useMutation({
    mutationFn: (brokerProfileId: string) => api.post(`/queues/${queue.id}/members`, { brokerProfileId }),
    onSuccess: () => { invalidate(); setAdding(''); toast('Corretor adicionado à fila'); },
    onError: (e: Error) => toast(e.message),
  });
  const removeMember = useMutation({
    mutationFn: (brokerProfileId: string) => api.del(`/queues/${queue.id}/members/${brokerProfileId}`),
    onSuccess: () => { invalidate(); toast('Corretor removido da fila'); },
    onError: (e: Error) => toast(e.message),
  });

  const memberIds = new Set(members.data?.map((m) => m.brokerProfileId));
  const available = allBrokers.data?.filter((b) => !memberIds.has(b.id)) ?? [];

  return (
    <Drawer
      title={queue.name}
      subtitle={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${queue.isActive ? 'bg-accent' : 'bg-line2'}`} />
          {STRATEGIES[queue.distributionStrategy]} · {queue.distributionEnabled ? 'auto ligada' : 'auto desligada'}
        </span>
      }
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-2">
        <KV k="Status" v={queue.isActive ? 'Ativa' : 'Inativa'} />
        <KV k="Estratégia" v={STRATEGIES[queue.distributionStrategy]} />
      </div>

      <p className="label mt-6 flex items-center gap-1.5">
        <Users size={13} strokeWidth={2} /> Corretores na fila
        {members.data && <span className="font-mono text-muted">· {members.data.length}</span>}
      </p>
      {members.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
        </div>
      ) : members.data?.length ? (
        <div className="space-y-2">
          {members.data.map((m) => {
            const av = AVAILABILITY[m.brokerProfile.availability];
            return (
              <div key={m.brokerProfileId} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: av.color }} title={av.label} />
                <span className="flex-1 truncate text-sm">{m.brokerProfile.user.name}</span>
                <span className="font-mono text-2xs text-muted">cap. {m.brokerProfile.maxActiveLeads}</span>
                {canManage && (
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="Remover da fila"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(m.brokerProfileId)}
                  >
                    <UserMinus size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
          Nenhum corretor nesta fila ainda.
        </p>
      )}

      {canManage && available.length > 0 && (
        <div className="mt-3 flex gap-2">
          <select className="input" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Adicionar corretor…</option>
            {available.map((b) => <option key={b.id} value={b.id}>{b.user.name}</option>)}
          </select>
          <button
            className="btn-primary btn-sm inline-flex items-center gap-1.5 whitespace-nowrap"
            disabled={!adding || addMember.isPending}
            onClick={() => addMember.mutate(adding)}
          >
            <UserPlus size={14} /> Adicionar
          </button>
        </div>
      )}

      {canConfig && (
        <>
          <p className="label mt-6 flex items-center gap-1.5"><Zap size={13} strokeWidth={2} /> Últimas distribuições</p>
          {logs.isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}
            </div>
          ) : logs.data?.length ? (
            <ul className="overflow-hidden rounded-xl border border-line">
              {logs.data.map((l, i) => (
                <li key={l.id} className={`flex items-center justify-between px-3 py-2 text-xs ${i % 2 ? 'bg-paper' : 'bg-surface'}`}>
                  <span className="text-muted">{dateTime(l.createdAt)}</span>
                  <span className={`pill ${l.result === 'ASSIGNED' ? 'bg-accent-50 text-accent-600' : 'bg-amber-50 text-amber-700'}`}>
                    {DIST_RESULT[l.result] ?? l.result}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
              Sem registros de distribuição.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
