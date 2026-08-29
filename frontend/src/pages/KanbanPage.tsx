import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, KanbanSquare, MapPin } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { allowedTransitions, reasonRequired } from '../lib/leadStatus';
import {
  LEAD_STATUS_META,
  type Lead,
  type LeadStatus,
  type Paginated,
} from '../lib/types';

// Colunas que fazem sentido num quadro operacional (omite arquivados).
const COLUMNS: LeadStatus[] = [
  'AWAITING_DISTRIBUTION',
  'DISTRIBUTED',
  'IN_SERVICE',
  'IN_QUALIFICATION',
  'VISIT_SCHEDULED',
  'FUTURE_PROPOSAL',
  'RESOLVED',
  'LOST',
];

export default function KanbanPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const KANBAN_KEY = ['leads', 'kanban'] as const;

  // Puxa um lote grande para montar o quadro (paginação simples server-side).
  const { data, isLoading } = useQuery({
    queryKey: KANBAN_KEY,
    queryFn: () => api.get<Paginated<Lead>>('/leads?page=1&pageSize=100'),
  });

  const move = useMutation({
    mutationFn: ({ id, to, reason }: { id: string; to: LeadStatus; reason?: string }) =>
      api.post(`/leads/${id}/status`, { status: to, reason }),
    // Otimista: move o card na hora, sem esperar a rede — antes disso, toda
    // troca de coluna invalidava os 100 leads inteiros e esperava recarregar
    // do zero antes do card "assentar" (era o que parecia lento no funil).
    // Reconciliar com o servidor ainda acontece (onSettled), só não trava a
    // interação esperando por isso.
    onMutate: async ({ id, to }) => {
      await qc.cancelQueries({ queryKey: KANBAN_KEY });
      const previous = qc.getQueryData<Paginated<Lead>>(KANBAN_KEY);
      if (previous) {
        qc.setQueryData<Paginated<Lead>>(KANBAN_KEY, {
          ...previous,
          items: previous.items.map((l) => (l.id === id ? { ...l, status: to } : l)),
        });
      }
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      // Reverte o card pra coluna original — a transição não foi aceita.
      if (ctx?.previous) qc.setQueryData(KANBAN_KEY, ctx.previous);
      toast(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KANBAN_KEY }),
  });

  function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id);
    const to = e.over?.id as LeadStatus | undefined;
    if (!to) return;
    const lead = data?.items.find((l) => l.id === leadId);
    if (!lead || lead.status === to) return;

    if (!allowedTransitions(lead.status).includes(to)) {
      toast(`Transição inválida: ${LEAD_STATUS_META[lead.status].label} → ${LEAD_STATUS_META[to].label}`);
      return;
    }
    let reason: string | undefined;
    if (reasonRequired(to)) {
      const r = window.prompt(`Motivo obrigatório para "${LEAD_STATUS_META[to].label}":`);
      if (!r?.trim()) return;
      reason = r.trim();
    }
    move.mutate({ id: leadId, to, reason });
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.slice(0, 6).map((s) => (
          <div key={s} className="w-64 flex-shrink-0 rounded-2xl bg-paper p-2">
            <div className="flex items-center justify-between px-2 py-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-5" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const total = data?.items.length ?? 0;
  if (total === 0) {
    return (
      <div className="card mx-auto max-w-lg">
        <EmptyState
          icon={KanbanSquare}
          title="Nenhum lead no quadro"
          description="Quando houver leads em atendimento, eles aparecem aqui organizados por etapa. Cadastre leads na aba Leads para começar."
        />
      </div>
    );
  }

  const byStatus = (s: LeadStatus) => data?.items.filter((l) => l.status === s) ?? [];

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Arraste um lead para mudar o status. Só transições válidas são aceitas; perder ou arquivar pede um motivo.
      </p>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((s) => (
            <Column key={s} status={s} leads={byStatus(s)} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ status, leads }: { status: LeadStatus; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = LEAD_STATUS_META[status];
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 flex-shrink-0 flex-col rounded-2xl p-2 transition-colors ${
        isOver ? 'bg-accent-50 ring-1 ring-accent-100' : 'bg-paper'
      }`}
    >
      <div className="flex items-center justify-between px-2 py-2">
        <span className={`pill ${meta.className}`}>{meta.label}</span>
        <span className="font-mono text-xs text-muted">{leads.length}</span>
      </div>
      <div className="space-y-2">
        {leads.length === 0 ? (
          <div className={`rounded-xl border border-dashed py-6 text-center text-2xs transition-colors ${
            isOver ? 'border-accent-100 text-accent-600' : 'border-line2 text-muted/70'
          }`}>
            {isOver ? 'Soltar aqui' : '—'}
          </div>
        ) : (
          leads.map((l) => <Card key={l.id} lead={l} />)
        )}
      </div>
    </div>
  );
}

function Card({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined}
      className={`group card cursor-grab p-3 active:cursor-grabbing ${isDragging ? 'opacity-70 shadow-pop' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={14} className="mt-0.5 flex-shrink-0 text-line2 transition-colors group-hover:text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{lead.name}</p>
          <p className="font-mono text-xs text-muted">{lead.phone}</p>
          {lead.cityOfInterest && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-2xs text-muted">
              <MapPin size={11} strokeWidth={2} /> {lead.cityOfInterest}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
