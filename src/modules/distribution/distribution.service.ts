import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DistributionResult,
  DistributionStrategy as StrategyKey,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  BrokerCandidate,
  STRATEGY_REGISTRY,
  StrategyRegistry,
} from './distribution.strategies';

/**
 * Quem disparou a distribuição. `AuthenticatedUser` continua sendo aceito
 * (é estruturalmente compatível), mas o motor também pode ser acionado pelo
 * SISTEMA — por exemplo, pelo webhook do WhatsApp, onde não há usuário
 * logado. Nesse caso `id` é null (os campos `assignedById`/`changedById` são
 * soft refs e já documentam "null = sistema") e a auditoria registra SYSTEM
 * em vez de fingir que foi uma pessoa.
 */
export type DistributionActor = {
  id: string | null;
  tenantId: string;
  system?: boolean;
};

/** Ator para ações automáticas, sem usuário logado. */
export function systemActor(tenantId: string): DistributionActor {
  return { id: null, tenantId, system: true };
}

/** Profundidade máxima da cadeia (regional → gerente → ... ). Anti-ciclo. */
const MAX_ROUTING_DEPTH = 5;

export interface DistributionOutcome {
  result: DistributionResult;
  brokerProfileId?: string;
  assignmentId?: string;
  candidateCount: number;
}

// Forma interna do log; o método privado `log` preenche o resto.
type LogInput = {
  leadId: string;
  queueId: string | null;
  strategy?: StrategyKey | null;
  result: DistributionResult;
  brokerProfileId?: string | null;
  candidateCount: number;
  message?: string | null;
};

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STRATEGY_REGISTRY) private readonly strategies: StrategyRegistry,
  ) {}

  /**
   * Distribui UM lead para um corretor elegível da sua fila.
   *
   * Segurança contra corrida: tudo roda numa transação que TRAVA a linha
   * da fila (SELECT ... FOR UPDATE). Isso serializa a distribuição daquela
   * fila — duas chamadas simultâneas para a mesma fila viram fila indiana.
   * O índice único parcial (1 atribuição ativa por lead) é a rede final no
   * banco. Resultados de negócio (sem corretor, sem fila) NÃO são exceção:
   * retornam um outcome e ficam registrados no DistributionLog.
   */
  async distributeLead(
    actor: DistributionActor,
    leadId: string,
    queueIdOverride?: string,
  ): Promise<DistributionOutcome> {
    const outcome = await this.prisma.tx<DistributionOutcome>(async (trx) => {
      // 1. Lead (a RLS já escopa pelo tenant da sessão)
      const lead = await trx.lead.findUnique({
        where: { id: leadId },
        select: { id: true, status: true, currentQueueId: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      const entryQueueId = queueIdOverride ?? lead.currentQueueId;
      if (!entryQueueId) {
        await this.log(trx, actor, {
          leadId,
          queueId: null,
          result: 'NO_QUEUE',
          candidateCount: 0,
          message: 'Lead sem fila de destino',
        });
        return { result: 'NO_QUEUE', candidateCount: 0 };
      }

      // 1b. Cadeia de distribuição: se a fila de entrada for um roteador
      //     (ex.: "Regional"), desce até a fila de um gerente respeitando
      //     os percentuais. Se não tiver filhas, o id continua o mesmo e
      //     o comportamento é exatamente o de antes.
      const queueId = await this.resolveLeafQueue(trx, entryQueueId);

      // 2. TRAVA a fila (serializa esta fila). Se não existir/estiver
      //    inativa no tenant, nada é travado e abortamos com resultado.
      const locked = await trx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "Queue"
        WHERE id = ${queueId} AND "isActive" = true
        FOR UPDATE
      `);
      if (locked.length === 0) {
        await this.log(trx, actor, {
          leadId,
          queueId,
          result: 'QUEUE_INACTIVE',
          candidateCount: 0,
          message: 'Fila inexistente ou inativa',
        });
        return { result: 'QUEUE_INACTIVE', candidateCount: 0 };
      }

      const queue = await trx.queue.findUnique({
        where: { id: queueId },
        select: {
          distributionStrategy: true,
          distributionEnabled: true,
          lastAssignedBrokerProfileId: true,
        },
      });
      if (!queue) throw new NotFoundException('Fila não encontrada');

      // 3. Já tem corretor ativo? Então não é caso de distribuição
      //    (use transferência/redistribuição). Evita roubar lead de alguém.
      const active = await trx.leadAssignment.findFirst({
        where: { leadId, endedAt: null },
        select: { id: true },
      });
      if (active) {
        await this.log(trx, actor, {
          leadId,
          queueId,
          result: 'ALREADY_ASSIGNED',
          candidateCount: 0,
          message: 'Lead já possui corretor ativo',
        });
        return { result: 'ALREADY_ASSIGNED', candidateCount: 0 };
      }

      // 4. Candidatos: membros da fila, disponíveis, aceitando distribuição,
      //    usuário ativo e ABAIXO da capacidade.
      const memberships = await trx.queueMembership.findMany({
        where: { queueId },
        select: {
          brokerProfile: {
            select: {
              id: true,
              availability: true,
              acceptsDistribution: true,
              maxActiveLeads: true,
              user: { select: { id: true, name: true, isActive: true } },
            },
          },
        },
      });

      const base = memberships
        .map((m) => m.brokerProfile)
        .filter(
          (bp) =>
            bp.availability === 'AVAILABLE' &&
            bp.acceptsDistribution &&
            bp.user.isActive,
        );

      const candidates: BrokerCandidate[] = [];
      for (const bp of base) {
        const activeCount = await trx.leadAssignment.count({
          where: { brokerProfileId: bp.id, endedAt: null },
        });
        if (activeCount < bp.maxActiveLeads) {
          candidates.push({
            brokerProfileId: bp.id,
            userId: bp.user.id,
            name: bp.user.name,
            activeCount,
            maxActiveLeads: bp.maxActiveLeads,
          });
        }
      }

      if (candidates.length === 0) {
        await this.log(trx, actor, {
          leadId,
          queueId,
          strategy: queue.distributionStrategy,
          result: 'NO_BROKER_AVAILABLE',
          candidateCount: 0,
          message: 'Nenhum corretor elegível (disponibilidade/capacidade)',
        });
        return { result: 'NO_BROKER_AVAILABLE', candidateCount: 0 };
      }

      // 5. Estratégia escolhe (round-robin usa o cursor da fila).
      const strategy = this.strategies.get(queue.distributionStrategy);
      if (!strategy) {
        // Defesa: estratégia não registrada. Não deveria acontecer.
        throw new Error(
          `Estratégia não registrada: ${queue.distributionStrategy}`,
        );
      }
      const chosen = strategy.pick(candidates, {
        lastAssignedBrokerProfileId: queue.lastAssignedBrokerProfileId,
      });

      // 6. Atribui + move o lead + avança o cursor + histórico + log.
      //    O índice único parcial garante no banco 1 atribuição ativa/lead.
      const assignment = await trx.leadAssignment.create({
        data: {
          tenantId: actor.tenantId,
          leadId,
          brokerProfileId: chosen.brokerProfileId,
          reason: 'AUTO_DISTRIBUTION',
          assignedById: actor.id,
        },
        select: { id: true },
      });

      await trx.lead.update({
        where: { id: leadId },
        data: { status: 'DISTRIBUTED', currentQueueId: queueId },
      });

      await trx.queue.update({
        where: { id: queueId },
        data: { lastAssignedBrokerProfileId: chosen.brokerProfileId },
      });

      await trx.leadStatusHistory.create({
        data: {
          tenantId: actor.tenantId,
          leadId,
          fromStatus: lead.status,
          toStatus: 'DISTRIBUTED',
          reason: 'Distribuição automática',
          changedById: actor.id,
        },
      });

      await this.log(trx, actor, {
        leadId,
        queueId,
        strategy: queue.distributionStrategy,
        result: 'ASSIGNED',
        brokerProfileId: chosen.brokerProfileId,
        candidateCount: candidates.length,
      });

      return {
        result: 'ASSIGNED',
        brokerProfileId: chosen.brokerProfileId,
        assignmentId: assignment.id,
        candidateCount: candidates.length,
      };
    });

    // Auditoria fora da transação (não bloqueia o commit).
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: actor.system ? 'SYSTEM' : 'USER',
      action: 'lead.distributed',
      resourceType: 'Lead',
      resourceId: leadId,
      metadata: {
        result: outcome.result,
        brokerProfileId: outcome.brokerProfileId ?? null,
      },
    });

    return outcome;
  }

  /**
   * Caminho AUTOMÁTICO (gatilho on-create). Diferente do manual, respeita
   * a flag distributionEnabled da fila: se a distribuição automática está
   * desligada, não faz nada. Nunca lança — é fire-and-forget.
   */
  async autoDistribute(
    actor: DistributionActor,
    leadId: string,
  ): Promise<void> {
    const lead = await this.prisma.client.lead.findUnique({
      where: { id: leadId },
      select: { currentQueueId: true },
    });
    if (!lead?.currentQueueId) return;

    const queue = await this.prisma.client.queue.findUnique({
      where: { id: lead.currentQueueId },
      select: { distributionEnabled: true },
    });
    if (!queue?.distributionEnabled) return;

    await this.distributeLead(actor, leadId);
  }

  /** Configura estratégia e liga/desliga a distribuição de uma fila. */
  async setQueueConfig(
    actor: AuthenticatedUser,
    queueId: string,
    dto: { strategy?: StrategyKey; enabled?: boolean },
  ) {
    const q = await this.prisma.client.queue.findFirst({
      where: { id: queueId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException('Fila não encontrada');

    const updated = await this.prisma.client.queue.update({
      where: { id: queueId },
      data: {
        distributionStrategy: dto.strategy,
        distributionEnabled: dto.enabled,
      },
      select: {
        id: true,
        distributionStrategy: true,
        distributionEnabled: true,
      },
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'distribution.configured',
      resourceType: 'Queue',
      resourceId: queueId,
      metadata: { ...dto },
    });
    return updated;
  }

  /** Últimos registros de distribuição de uma fila (observabilidade). */
  async queueLogs(_actor: AuthenticatedUser, queueId: string, limit = 50) {
    return this.prisma.client.distributionLog.findMany({
      where: { queueId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }


  /**
   * Desce a árvore de filas até uma FOLHA (a fila onde os corretores
   * realmente estão), respeitando os percentuais configurados.
   *
   * Ex.: "Regional Nova Iguaçu" (70/30) → "Gerente Márcio" ou
   * "Gerente Wellington" → e aí o rodízio normal entre os corretores.
   *
   * Se a fila não tiver filhas, devolve ela mesma — então operações sem
   * cadeia continuam funcionando igual.
   */
  private async resolveLeafQueue(
    trx: Prisma.TransactionClient,
    rootQueueId: string,
  ): Promise<string> {
    let currentId = rootQueueId;

    // Limite de profundidade: protege contra ciclo acidental na config.
    for (let depth = 0; depth < MAX_ROUTING_DEPTH; depth++) {
      const children = await trx.queue.findMany({
        where: { parentId: currentId, isActive: true, distributionEnabled: true },
        select: { id: true, routingWeight: true, routedCount: true },
        orderBy: { id: 'asc' }, // ordem estável = desempate previsível
      });
      if (children.length === 0) return currentId; // chegou na folha

      // Prefere ramos que realmente têm para quem distribuir. Assim, se a
      // equipe de um gerente está toda offline, o lead vai para o outro em
      // vez de ficar parado.
      const viable: typeof children = [];
      for (const child of children) {
        if (await this.branchCanReceive(trx, child.id)) viable.push(child);
      }

      const chosen = this.pickByWeight(viable.length > 0 ? viable : children);

      // Contador do ramo escolhido: é ele que mantém a proporção ao longo
      // do tempo (ver pickByWeight).
      await trx.queue.update({
        where: { id: chosen.id },
        data: { routedCount: { increment: 1 } },
      });
      currentId = chosen.id;
    }

    return currentId;
  }

  /**
   * Escolha por peso DETERMINÍSTICA (weighted round-robin): pega o ramo com
   * menor (recebidos + 1) / peso.
   *
   * Preferi isso a sorteio aleatório porque mantém a proporção real desde
   * os primeiros leads e é explicável para o gestor — com sorteio, um
   * gerente 70% pode pegar 5 seguidos por acaso e parecer defeito.
   */
  private pickByWeight<T extends { routingWeight: number; routedCount: number }>(
    branches: T[],
  ): T {
    // Peso 0 = ramo desligado; só entra se todos estiverem zerados.
    const positive = branches.filter((b) => b.routingWeight > 0);
    const pool = positive.length > 0 ? positive : branches;

    let best = pool[0];
    let bestRatio = Number.POSITIVE_INFINITY;
    for (const branch of pool) {
      const weight = branch.routingWeight > 0 ? branch.routingWeight : 1;
      const ratio = (branch.routedCount + 1) / weight;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = branch;
      }
    }
    return best;
  }

  /** Existe alguém apto neste ramo (ou em algum ramo abaixo dele)? */
  private async branchCanReceive(
    trx: Prisma.TransactionClient,
    queueId: string,
    depth = 0,
  ): Promise<boolean> {
    if (depth >= MAX_ROUTING_DEPTH) return false;

    const children = await trx.queue.findMany({
      where: { parentId: queueId, isActive: true, distributionEnabled: true },
      select: { id: true },
    });
    if (children.length > 0) {
      for (const child of children) {
        if (await this.branchCanReceive(trx, child.id, depth + 1)) return true;
      }
      return false;
    }

    // Folha: mesmos critérios da seleção de candidatos (passo 4).
    const memberships = await trx.queueMembership.findMany({
      where: { queueId },
      select: {
        brokerProfile: {
          select: {
            id: true,
            availability: true,
            acceptsDistribution: true,
            maxActiveLeads: true,
            user: { select: { isActive: true } },
          },
        },
      },
    });

    const available = memberships
      .map((m) => m.brokerProfile)
      .filter(
        (bp) =>
          bp.availability === 'AVAILABLE' &&
          bp.acceptsDistribution &&
          bp.user.isActive,
      );

    for (const bp of available) {
      const activeCount = await trx.leadAssignment.count({
        where: { brokerProfileId: bp.id, endedAt: null },
      });
      if (activeCount < bp.maxActiveLeads) return true; // basta um
    }
    return false;
  }

  private async log(
    trx: Prisma.TransactionClient,
    actor: DistributionActor,
    data: LogInput,
  ) {
    await trx.distributionLog.create({
      data: {
        tenantId: actor.tenantId,
        leadId: data.leadId,
        queueId: data.queueId ?? null,
        strategy: data.strategy ?? null,
        result: data.result,
        brokerProfileId: data.brokerProfileId ?? null,
        candidateCount: data.candidateCount,
        message: data.message ?? null,
      },
    });
  }
}
