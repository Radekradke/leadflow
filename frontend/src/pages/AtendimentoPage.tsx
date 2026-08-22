import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Lock, MessageCircle, MessageSquarePlus, Send, Settings } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { CardsSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { Field, Modal } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Queue } from '../lib/types';

type Conversation = {
  id: string;
  leadId: string;
  leadName: string;
  leadStatus: string | null;
  waPhone: string | null;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  unreadCount: number;
  windowExpiresAt: string | null;
};
type Message = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  status: string;
  createdAt: string;
};
type Account = {
  configured: boolean;
  dev?: boolean;
  displayNumber?: string | null;
  active?: boolean;
  phoneNumberId?: string;
};

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function AtendimentoPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const account = useQuery({
    queryKey: ['wa', 'account'],
    queryFn: () => api.get<Account>('/whatsapp/account'),
  });
  const convs = useQuery({
    queryKey: ['wa', 'conversations'],
    queryFn: () => api.get<Conversation[]>('/whatsapp/conversations'),
    refetchInterval: 10000,
  });
  const messages = useQuery({
    queryKey: ['wa', 'messages', active],
    queryFn: () => api.get<Message[]>(`/whatsapp/conversations/${active}/messages`),
    enabled: !!active,
    refetchInterval: 5000,
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      api.post(`/whatsapp/conversations/${active}/send`, { body }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['wa', 'messages', active] });
      qc.invalidateQueries({ queryKey: ['wa', 'conversations'] });
    },
    onError: () => toast('Falha ao enviar a mensagem'),
  });

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages.data, active]);

  function open(id: string) {
    setActive(id);
    qc.invalidateQueries({ queryKey: ['wa', 'conversations'] });
  }

  const activeConv = convs.data?.find((c) => c.id === active) ?? null;

  // ── Estado: não configurado ──
  if (account.data && account.data.configured === false) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-50 text-accent-600">
          <MessageCircle size={30} />
        </div>
        <p className="text-base font-semibold">WhatsApp ainda não configurado</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {can('whatsapp:configure')
            ? 'Conecte o número da imobiliária para começar a receber e responder mensagens.'
            : 'Peça ao administrador para conectar o número da imobiliária.'}
        </p>
        {can('whatsapp:configure') && (
          <button className="btn-primary btn-sm mt-5" onClick={() => setShowConfig(true)}>
            <Settings size={15} /> Configurar WhatsApp
          </button>
        )}
        {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}
      </div>
    );
  }

  return (
    <>
      {can('whatsapp:configure') && (
        <div className="mb-3 flex justify-end gap-2">
          {account.data?.dev && (
            <button className="btn-ghost btn-sm" onClick={() => setShowSim(true)}>
              <MessageSquarePlus size={15} /> Simular lead
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={() => setShowConfig(true)}>
            <Settings size={15} /> Configurar
          </button>
        </div>
      )}

      <div className="flex h-[calc(100vh-180px)] min-h-[420px] overflow-hidden rounded-2xl border border-line bg-surface">
        {/* Lista de conversas */}
        <aside
          className={`flex w-full flex-col border-r border-line md:w-[340px] ${
            active ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Conversas</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              {convs.data?.length ?? 0} ativas · canal WhatsApp
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convs.isLoading ? (
              <div className="p-3">
                <CardsSkeleton count={4} />
              </div>
            ) : !convs.data?.length ? (
              <EmptyState
                icon={MessageCircle}
                title="Nenhuma conversa ainda"
                description="Mensagens recebidas aparecem aqui automaticamente."
              />
            ) : (
              convs.data.map((c) => (
                <button
                  key={c.id}
                  onClick={() => open(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-line/70 px-4 py-3 text-left transition hover:bg-paper ${
                    active === c.id ? 'bg-paper' : ''
                  }`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                    {initials(c.leadName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.leadName}</span>
                      <span className="flex-shrink-0 text-2xs text-muted">
                        {hhmm(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">
                        {c.lastMessageText ?? '—'}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-green-500 px-1.5 text-2xs font-semibold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat */}
        <section
          className={`flex flex-1 flex-col ${active ? 'flex' : 'hidden md:flex'}`}
          style={{ background: '#efeae2' }}
        >
          {!activeConv ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-muted">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-green-500 shadow-card">
                <MessageCircle size={30} />
              </div>
              <p className="text-sm">Selecione uma conversa para começar a responder.</p>
            </div>
          ) : (
            <>
              {/* Cabeçalho */}
              <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-2.5">
                <button
                  className="md:hidden"
                  onClick={() => setActive(null)}
                  aria-label="Voltar"
                >
                  <ArrowLeft size={20} className="text-muted" />
                </button>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {initials(activeConv.leadName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{activeConv.leadName}</p>
                  <p className="flex items-center gap-1 text-2xs text-muted">
                    {activeConv.waPhone}
                    {activeConv.waPhone?.includes('*') && <Lock size={10} />}
                    · WhatsApp
                  </p>
                </div>
              </header>

              {/* Mensagens */}
              <div ref={bodyRef} className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
                {messages.data?.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${
                      m.direction === 'OUTBOUND'
                        ? 'ml-auto rounded-tr-sm bg-[#d9fdd3]'
                        : 'mr-auto rounded-tl-sm bg-white'
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words text-ink">{m.body}</span>
                    <span className="ml-2 inline-block align-bottom text-[10px] text-muted">
                      {hhmm(m.createdAt)}
                      {m.direction === 'OUTBOUND' && m.status === 'FAILED' && (
                        <span className="ml-1 text-red-500">falhou</span>
                      )}
                    </span>
                  </div>
                ))}
                {messages.isLoading && (
                  <p className="text-center text-2xs text-muted">carregando…</p>
                )}
              </div>

              {/* Composer */}
              <form
                className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = text.trim();
                  if (v && !send.isPending) send.mutate(v);
                }}
              >
                <input
                  className="flex-1 rounded-lg border-none bg-white px-3.5 py-2.5 text-sm outline-none"
                  placeholder="Digite uma mensagem"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={send.isPending || !text.trim()}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-50"
                  aria-label="Enviar"
                >
                  <Send size={17} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}
      {showSim && <SimulateModal onClose={() => setShowSim(false)} />}
    </>
  );
}

// ── Modal de simulação de lead recebido (modo dev) ──────────
function SimulateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    from: '5521999990000',
    name: 'Lead de teste',
    text: 'Olá! Vi o anúncio e tenho interesse em um imóvel.',
  });

  const run = useMutation({
    mutationFn: () =>
      api.post('/whatsapp/dev/simulate-inbound', {
        from: form.from.trim(),
        name: form.name.trim() || undefined,
        text: form.text.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa', 'conversations'] });
      toast('Lead recebido (simulado)');
      onClose();
    },
    onError: () => toast('Não foi possível simular o recebimento.'),
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.from.trim().length >= 8 && !!form.text.trim();

  return (
    <Modal title="Simular lead recebido" onClose={onClose}>
      <p className="mb-4 text-xs text-muted">
        Cria uma conversa como se o cliente tivesse mandado mensagem no WhatsApp — para
        testar o fluxo sem a Meta. Se o telefone já existir, cai na conversa desse lead.
      </p>
      <div className="space-y-3">
        <Field label="Telefone do cliente (país + DDD)">
          <input className="input" value={form.from} onChange={set('from')} />
        </Field>
        <Field label="Nome (opcional)">
          <input className="input" value={form.name} onChange={set('name')} placeholder="Ana Souza" />
        </Field>
        <Field label="Mensagem">
          <input className="input" value={form.text} onChange={set('text')} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
        <button className="btn-primary btn-sm" disabled={!valid || run.isPending} onClick={() => run.mutate()}>
          Simular recebimento
        </button>
      </div>
    </Modal>
  );
}

// ── Modal de configuração (admin) ───────────────────────────
function ConfigModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    phoneNumberId: '',
    accessToken: '',
    displayNumber: '',
    wabaId: '',
    defaultQueueId: '',
  });

  // Filas para escolher onde os leads do WhatsApp entram.
  const queues = useQuery({
    queryKey: ['queues'],
    queryFn: () => api.get<Queue[]>('/queues'),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post('/whatsapp/account', {
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
        displayNumber: form.displayNumber.trim() || undefined,
        wabaId: form.wabaId.trim() || undefined,
        defaultQueueId: form.defaultQueueId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa', 'account'] });
      qc.invalidateQueries({ queryKey: ['wa', 'conversations'] });
      toast('WhatsApp configurado');
      onClose();
    },
    onError: () => toast('Não foi possível salvar. Confira os dados.'),
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.phoneNumberId.trim() && form.accessToken.trim().length > 10;

  return (
    <Modal title="Configurar WhatsApp" onClose={onClose}>
      <p className="mb-4 text-xs text-muted">
        Dados do número no painel da Meta (WhatsApp Business Platform). O token é
        guardado criptografado.
      </p>
      <div className="space-y-3">
        <Field label="Phone Number ID">
          <input className="input" value={form.phoneNumberId} onChange={set('phoneNumberId')} />
        </Field>
        <Field label="Access Token (permanente)">
          <input className="input" value={form.accessToken} onChange={set('accessToken')} />
        </Field>
        <Field label="Número de exibição (opcional)">
          <input
            className="input"
            placeholder="+55 21 99999-0000"
            value={form.displayNumber}
            onChange={set('displayNumber')}
          />
        </Field>
        <Field label="WABA ID (opcional)">
          <input className="input" value={form.wabaId} onChange={set('wabaId')} />
        </Field>
        <Field
          label="Fila que recebe os leads"
          hint="Os leads que chegarem pelo WhatsApp entram nesta fila e são distribuídos automaticamente."
        >
          <select
            className="input"
            value={form.defaultQueueId}
            onChange={(e) => setForm((f) => ({ ...f, defaultQueueId: e.target.value }))}
          >
            <option value="">Escolher automaticamente</option>
            {(queues.data ?? [])
              .filter((q) => q.isActive)
              .map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                  {q.distributionEnabled ? '' : ' (distribuição desligada)'}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn-primary btn-sm"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate()}
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}
