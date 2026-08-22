import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ListChecks } from 'lucide-react';
import { useState } from 'react';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { dateTime, relDate } from '../lib/format';
import type { Paginated, Task } from '../lib/types';

const STATUS_LABEL: Record<Task['status'], string> = {
  PENDING: 'Pendente',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

export default function TasksPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'PENDING' | 'DONE' | ''>('PENDING');

  const params = new URLSearchParams({ page: '1', pageSize: '100' });
  if (status) params.set('status', status);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', status],
    queryFn: () => api.get<Paginated<Task>>(`/tasks?${params.toString()}`),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast('Tarefa concluída'); },
    onError: (e: Error) => toast(e.message),
  });

  const isOverdue = (t: Task) => t.status === 'PENDING' && t.dueAt && new Date(t.dueAt).getTime() < Date.now();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2">
        {(['PENDING', 'DONE', ''] as const).map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`btn-sm rounded-xl px-3 py-1.5 ${status === s ? 'btn-primary' : 'btn-ghost'}`}
          >
            {s === 'PENDING' ? 'Pendentes' : s === 'DONE' ? 'Concluídas' : 'Todas'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[60px]" />)}
        </div>
      ) : data?.items.length ? (
        <div className="space-y-2">
          {data.items.map((t) => (
            <div key={t.id} className="card-interactive flex items-center gap-3 p-4">
              {t.status === 'PENDING' ? (
                <button
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-line text-transparent transition-colors hover:border-accent hover:text-accent"
                  onClick={() => complete.mutate(t.id)}
                  title="Concluir"
                  disabled={complete.isPending}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
              ) : (
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${t.status === 'DONE' ? 'text-muted line-through' : ''}`}>{t.title}</p>
                {t.dueAt && (
                  <p className={`text-xs ${isOverdue(t) ? 'text-amber-700' : 'text-muted'}`}>
                    {isOverdue(t) ? 'Atrasada · ' : ''}vence {relDate(t.dueAt)} ({dateTime(t.dueAt)})
                  </p>
                )}
              </div>
              <span className="pill bg-slate-100 text-slate-600">{STATUS_LABEL[t.status]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={ListChecks}
            title="Nenhuma tarefa por aqui"
            description={status === 'PENDING' ? 'Tudo em dia! Nenhuma tarefa pendente.' : 'Crie tarefas a partir de um lead.'}
          />
        </div>
      )}
    </div>
  );
}
