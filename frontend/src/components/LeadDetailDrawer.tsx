import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, dateTime, relDate } from '../lib/format';
import { INTERACTION_TYPES, OUTCOMES } from '../lib/labels';
import { allowedTransitions, reasonRequired } from '../lib/leadStatus';
import {
  LEAD_STATUS_META,
  type BrokerProfile,
  type Interaction,
  type Lead,
  type LeadStatus,
  type Queue,
} from '../lib/types';
import StatusPill from './StatusPill';
import { Drawer, Field, KV, Modal } from './ui';
import { useToast } from './Toast';

export default function LeadDetailDrawer({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<null | 'status' | 'contact' | 'task' | 'transfer'>(
    null,
  );

  const interactions = useQuery({
    queryKey: ['lead', lead.id, 'interactions'],
    queryFn: () => api.get<Interaction[]>(`/leads/${lead.id}/interactions`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['lead', lead.id, 'interactions'] });
  };

  return (
    <Drawer title={lead.name} subtitle={<StatusPill status={lead.status} />} onClose={onClose}>
      <KV
        k="Telefone"
        v={
          <span className="font-mono">
            {lead.phone ?? '—'}
            {lead.phone?.includes('*') && (
              <span className="ml-1 text-muted" title="Mascarado para seu papel — atenda pelo chat interno">🔒</span>
            )}
          </span>
        }
      />
      <KV
        k="CPF"
        v={
          <span className="font-mono">
            {lead.cpf ?? '—'}
            {lead.cpf?.includes('*') && (
              <span className="ml-1 text-muted" title="Mascarado para seu papel">🔒</span>
            )}
          </span>
        }
      />
      <KV k="Renda familiar" v={<span className="font-mono">{lead.familyIncome ? brl(lead.familyIncome) : '•••••'}</span>} />
      <KV k="Cidade" v={lead.cityOfInterest ?? '—'} />
      <KV k="Origem" v={lead.origin} />
      <KV k="Último contato" v={relDate(lead.lastContactAt)} />

      <div className="mt-5 flex flex-wrap gap-2">
        {can('interaction:create') && (
          <button className="btn-ghost btn-sm" onClick={() => setSheet('contact')}>
            Registrar contato
          </button>
        )}
        {can('task:manage') && (
          <button className="btn-ghost btn-sm" onClick={() => setSheet('task')}>
            Criar tarefa
          </button>
        )}
        {can('lead:transfer') && (
          <button className="btn-ghost btn-sm" onClick={() => setSheet('transfer')}>
            Transferir
          </button>
        )}
      </div>

      {can('lead:update') && (
        <>
          <p className="label mt-6">Mudar status</p>
          <div className="flex flex-wrap gap-2">
            {allowedTransitions(lead.status).length ? (
              allowedTransitions(lead.status).map((s) => (
                <StatusButton key={s} leadId={lead.id} to={s} onDone={() => { refresh(); onClose(); }} />
              ))
            ) : (
              <span className="text-sm text-muted">Status terminal — sem transições.</span>
            )}
          </div>
        </>
      )}

      <p className="label mt-7">Histórico de interações</p>
      {interactions.isLoading ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : interactions.data?.length ? (
        <ol className="mt-1 space-y-3 border-l-2 border-line pl-4">
          {interactions.data.map((ev) => (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
              <p className="text-sm font-medium">
                {INTERACTION_TYPES[ev.type] ?? ev.type}
                {ev.outcome && <span className="ml-2 text-xs text-muted">{OUTCOMES[ev.outcome]}</span>}
              </p>
              {ev.content && <p className="text-xs text-muted">{ev.content}</p>}
              <p className="text-xs text-muted">{dateTime(ev.createdAt)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Sem interações registradas.</p>
      )}

      {sheet === 'contact' && (
        <ContactModal leadId={lead.id} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); toast('Contato registrado'); }} />
      )}
      {sheet === 'task' && (
        <TaskModal leadId={lead.id} onClose={() => setSheet(null)} onDone={() => { setSheet(null); toast('Tarefa criada'); }} />
      )}
      {sheet === 'transfer' && (
        <TransferModal leadId={lead.id} onClose={() => setSheet(null)} onDone={() => { setSheet(null); refresh(); onClose(); }} />
      )}
    </Drawer>
  );
}

function StatusButton({ leadId, to, onDone }: { leadId: string; to: LeadStatus; onDone: () => void }) {
  const toast = useToast();
  const m = useMutation({
    mutationFn: (reason?: string) => api.post(`/leads/${leadId}/status`, { status: to, reason }),
    onSuccess: () => { toast(`Status → ${LEAD_STATUS_META[to].label}`); onDone(); },
    onError: (e: Error) => toast(e.message),
  });
  const run = () => {
    if (reasonRequired(to)) {
      const reason = window.prompt(`Motivo obrigatório para "${LEAD_STATUS_META[to].label}":`);
      if (!reason?.trim()) return;
      m.mutate(reason.trim());
    } else m.mutate(undefined);
  };
  return (
    <button className="btn-ghost btn-sm" disabled={m.isPending} onClick={run}>
      {LEAD_STATUS_META[to].label}
    </button>
  );
}

function ContactModal({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState('CALL');
  const [outcome, setOutcome] = useState('');
  const [content, setContent] = useState('');
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/interactions`, { type, outcome: outcome || undefined, content: content || undefined }),
    onSuccess: onDone,
    onError: (e: Error) => toast(e.message),
  });
  return (
    <Modal title="Registrar contato" onClose={onClose}>
      <Field label="Tipo">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(INTERACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Resultado">
        <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">—</option>
          {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Observação">
        <textarea className="input" rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm" disabled={m.isPending} onClick={() => m.mutate()}>Salvar</button>
      </div>
    </Modal>
  );
}

function TaskModal({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.post('/tasks', { title, leadId, dueAt: dueAt || undefined }),
    onSuccess: onDone,
    onError: (e: Error) => toast(e.message),
  });
  return (
    <Modal title="Criar tarefa" onClose={onClose}>
      <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Ligar amanhã de manhã" /></Field>
      <Field label="Vencimento"><input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm" disabled={!title.trim() || m.isPending} onClick={() => m.mutate()}>Criar</button>
      </div>
    </Modal>
  );
}

function TransferModal({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'broker' | 'queue'>('broker');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const toast = useToast();
  const brokers = useQuery({ queryKey: ['brokers'], queryFn: () => api.get<BrokerProfile[]>('/brokers') });
  const queues = useQuery({ queryKey: ['queues'], queryFn: () => api.get<Queue[]>('/queues') });
  const m = useMutation({
    mutationFn: () =>
      mode === 'broker'
        ? api.post(`/leads/${leadId}/transfer/broker`, { toBrokerProfileId: target, reason })
        : api.post(`/leads/${leadId}/transfer/queue`, { toQueueId: target, reason }),
    onSuccess: () => { toast('Lead transferido'); onDone(); },
    onError: (e: Error) => toast(e.message),
  });
  return (
    <Modal title="Transferir lead" onClose={onClose}>
      <Field label="Destino">
        <div className="flex gap-2">
          <button className={`btn-sm flex-1 ${mode === 'broker' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setMode('broker'); setTarget(''); }}>Corretor</button>
          <button className={`btn-sm flex-1 ${mode === 'queue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setMode('queue'); setTarget(''); }}>Fila</button>
        </div>
      </Field>
      <Field label={mode === 'broker' ? 'Corretor' : 'Fila'}>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Selecione…</option>
          {mode === 'broker'
            ? brokers.data?.map((b) => <option key={b.id} value={b.id}>{b.user.name}</option>)
            : queues.data?.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      </Field>
      <Field label="Motivo (obrigatório)">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm" disabled={!target || !reason.trim() || m.isPending} onClick={() => m.mutate()}>Transferir</button>
      </div>
    </Modal>
  );
}
