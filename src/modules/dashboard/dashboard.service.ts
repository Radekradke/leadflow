import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const TERMINAL: LeadStatus[] = ['RESOLVED', 'LOST', 'ARCHIVED'];
const STALE_DAYS = 3;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Painel OPERACIONAL — a visão do próprio usuário. A carteira é escopada
   * pelas atribuições ATIVAS dele (brokerProfileId = meu perfil), então um
   * corretor só enxerga os próprios leads. As tarefas independem de ser
   * corretor (atendimento também tem follow-ups).
   */
  async operational(user: AuthenticatedUser) {
    const now = new Date();
    const staleThreshold = daysAgo(STALE_DAYS);

    const [pending, overdue, dueToday] = await Promise.all([
      this.prisma.client.task.count({
        where: { assignedToUserId: user.id, status: 'PENDING' },
      }),
      this.prisma.client.task.count({
        where: {
          assignedToUserId: user.id,
          status: 'PENDING',
          dueAt: { lt: now },
        },
      }),
      this.prisma.client.task.count({
        where: {
          assignedToUserId: user.id,
          status: 'PENDING',
          dueAt: { gte: startOfDay(now), lte: endOfDay(now) },
        },
      }),
    ]);
    const tasks = { pending, overdue, dueToday };

    const profile = await this.prisma.client.brokerProfile.findFirst({
      where: { userId: user.id },
      select: { id: true, maxActiveLeads: true, availability: true },
    });

    // Sem perfil de corretor: ainda mostra as tarefas, sem carteira.
    if (!profile) {
      return { isBroker: false, portfolio: null, tasks };
    }

    const activeAssignments = await this.prisma.client.leadAssignment.findMany({
      where: { brokerProfileId: profile.id, endedAt: null },
      select: {
        lead: {
          select: {
            id: true,
            name: true,
            status: true,
            lastContactAt: true,
            createdAt: true,
          },
        },
      },
    });
    const leads = activeAssignments.map((a) => a.lead);

    const byStatus: Record<string, number> = {};
    let stale = 0;
    let noResponse = 0;
    for (const l of leads) {
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
      if (l.status === 'NO_RESPONSE') noResponse++;
      // "parado": sem contato há X dias; nunca contatado conta da criação
      const ref = l.lastContactAt ?? l.createdAt;
      if (ref < staleThreshold) stale++;
    }

    const activeCount = leads.length;
    const capacity = profile.maxActiveLeads;

    // Encerrados: leads que já passaram por este corretor e terminaram
    // (convertidos, perdidos ou arquivados). A atribuição fica encerrada
    // quando o lead fecha, então não entram na carteira ativa acima.
    const closed = await this.prisma.client.lead.count({
      where: {
        status: { in: ['RESOLVED', 'LOST', 'ARCHIVED'] },
        assignments: { some: { brokerProfileId: profile.id } },
      },
    });
    // "Em atendimento": ativos que NÃO estão sem resposta.
    const inService = Math.max(activeCount - noResponse, 0);

    return {
      isBroker: true,
      availability: profile.availability,
      portfolio: {
        activeCount,
        capacity,
        utilization: capacity ? Math.round((activeCount / capacity) * 100) : 0,
        byStatus,
        stale,
        noResponse,
        inService,
        closed,
      },
      tasks,
    };
  }

  /**
   * Painel GERENCIAL — tenant-wide (a RLS já escopa pelo tenant). Tudo via
   * agregação no banco (groupBy/count), nada de carregar listas grandes.
   * Coordenador ainda vê tenant-wide; recortar por equipe é refinamento.
   */
  async management(_user: AuthenticatedUser) {
    const now = new Date();
    const stale = daysAgo(STALE_DAYS);
    const last7 = daysAgo(7);
    const last30 = daysAgo(30);

    const [
      statusGroups,
      awaitingByQueue,
      loadGroups,
      distLogGroups,
      resolved,
      lost,
      intakeToday,
      intake7,
      intake30,
      staleLeads,
    ] = await Promise.all([
      this.prisma.client.lead.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.client.lead.groupBy({
        by: ['currentQueueId'],
        where: { status: 'AWAITING_DISTRIBUTION' },
        _count: { _all: true },
      }),
      this.prisma.client.leadAssignment.groupBy({
        by: ['brokerProfileId'],
        where: { endedAt: null },
        _count: { _all: true },
      }),
      this.prisma.client.distributionLog.groupBy({
        by: ['result'],
        where: { createdAt: { gte: last7 } },
        _count: { _all: true },
      }),
      this.prisma.client.lead.count({ where: { status: 'RESOLVED' } }),
      this.prisma.client.lead.count({ where: { status: 'LOST' } }),
      this.prisma.client.lead.count({
        where: { createdAt: { gte: startOfDay(now) } },
      }),
      this.prisma.client.lead.count({ where: { createdAt: { gte: last7 } } }),
      this.prisma.client.lead.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.client.lead.count({
        where: {
          status: { notIn: TERMINAL },
          OR: [
            { lastContactAt: { lt: stale } },
            { AND: [{ lastContactAt: null }, { createdAt: { lt: stale } }] },
          ],
        },
      }),
    ]);

    // Leads por status (funil)
    const leadsByStatus: Record<string, number> = {};
    for (const g of statusGroups) leadsByStatus[g.status] = g._count._all;

    // Aguardando distribuição por fila (resolve nomes)
    const queueIds = awaitingByQueue
      .map((g) => g.currentQueueId)
      .filter((id): id is string => !!id);
    const queues = queueIds.length
      ? await this.prisma.client.queue.findMany({
          where: { id: { in: queueIds } },
          select: { id: true, name: true },
        })
      : [];
    const queueName = new Map(queues.map((q) => [q.id, q.name]));
    const awaitingDistribution = awaitingByQueue.map((g) => ({
      queueId: g.currentQueueId,
      queueName: g.currentQueueId
        ? (queueName.get(g.currentQueueId) ?? '—')
        : 'Sem fila',
      count: g._count._all,
    }));

    // Carga por corretor (resolve nome + capacidade)
    const brokerIds = loadGroups.map((g) => g.brokerProfileId);
    // O tipo explícito no caso vazio evita que o TypeScript infira `never[]`
    // e acabe perdendo o formato do corretor lá no Map abaixo.
    const brokers: { id: string; maxActiveLeads: number; user: { name: string } }[] =
      brokerIds.length
        ? await this.prisma.client.brokerProfile.findMany({
            where: { id: { in: brokerIds } },
            select: {
              id: true,
              maxActiveLeads: true,
              user: { select: { name: true } },
            },
          })
        : [];
    const brokerInfo = new Map(brokers.map((b) => [b.id, b] as const));
    const brokerLoad = loadGroups
      .map((g) => {
        const b = brokerInfo.get(g.brokerProfileId);
        const activeCount = g._count._all;
        const capacity = b?.maxActiveLeads ?? 0;
        return {
          brokerProfileId: g.brokerProfileId,
          name: b?.user.name ?? '—',
          activeCount,
          capacity,
          utilization: capacity
            ? Math.round((activeCount / capacity) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.activeCount - a.activeCount);

    // Resultado das distribuições (últimos 7 dias)
    const distributionLast7Days: Record<string, number> = {};
    for (const g of distLogGroups)
      distributionLast7Days[g.result] = g._count._all;

    const denom = resolved + lost;
    const rate = denom ? Math.round((resolved / denom) * 100) : null;

    return {
      leadsByStatus,
      awaitingDistribution,
      brokerLoad,
      distributionLast7Days,
      conversion: { resolved, lost, rate }, // rate em %, null se sem dados
      intake: { today: intakeToday, last7Days: intake7, last30Days: intake30 },
      staleLeads, // não-terminais sem contato há STALE_DAYS+
    };
  }
}
