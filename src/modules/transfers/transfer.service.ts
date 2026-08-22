import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { DistributionService } from '../distribution/distribution.service';
import { leadScopeWhere } from '../leads/lead.scope';
import { RedistributeDto } from './dto/transfer.dto';

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly distribution: DistributionService,
  ) {}

  /** Trava a linha do lead — serializa qualquer mudança de dono dele. */
  private async lockLead(trx: Prisma.TransactionClient, leadId: string) {
    await trx.$queryRaw(
      Prisma.sql`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`,
    );
  }

  /**
   * Transfere o lead para um corretor específico. Encerra a atribuição
   * ativa (se houver) e abre uma nova — nesta ordem, para nunca violar o
   * índice "1 atribuição ativa por lead". É um override manual: não checa
   * disponibilidade nem capacidade do destino (decisão deliberada de quem
   * tem lead:transfer).
   */
  async transferToBroker(
    actor: AuthenticatedUser,
    leadId: string,
    toBrokerProfileId: string,
    reason: string,
  ) {
    const out = await this.prisma.tx(async (trx) => {
      await this.lockLead(trx, leadId);

      const lead = await trx.lead.findFirst({
        where: { id: leadId, ...leadScopeWhere(actor) },
        select: { id: true, status: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      const broker = await trx.brokerProfile.findFirst({
        where: { id: toBrokerProfileId },
        select: { id: true },
      });
      if (!broker) throw new BadRequestException('Corretor de destino inválido');

      const current = await trx.leadAssignment.findFirst({
        where: { leadId, endedAt: null },
        select: { id: true, brokerProfileId: true },
      });
      if (current?.brokerProfileId === toBrokerProfileId) {
        throw new BadRequestException('O lead já é deste corretor');
      }

      const type = current ? 'BROKER_TO_BROKER' : 'QUEUE_TO_BROKER';

      // 1. encerra a atual (se houver)
      if (current) {
        await trx.leadAssignment.update({
          where: { id: current.id },
          data: { endedAt: new Date() },
        });
      }
      // 2. abre a nova
      await trx.leadAssignment.create({
        data: {
          tenantId: actor.tenantId,
          leadId,
          brokerProfileId: toBrokerProfileId,
          reason: 'TRANSFER',
          assignedById: actor.id,
        },
      });
      // 3. registra a transferência (motivo obrigatório)
      await trx.leadTransfer.create({
        data: {
          tenantId: actor.tenantId,
          leadId,
          type,
          fromBrokerProfileId: current?.brokerProfileId ?? null,
          toBrokerProfileId,
          reason,
          performedById: actor.id,
        },
      });
      // 4. se o lead não tinha dono, agora está distribuído
      if (!current) {
        await trx.lead.update({
          where: { id: leadId },
          data: { status: 'DISTRIBUTED' },
        });
        await trx.leadStatusHistory.create({
          data: {
            tenantId: actor.tenantId,
            leadId,
            fromStatus: lead.status,
            toStatus: 'DISTRIBUTED',
            reason: 'Atribuição manual',
            changedById: actor.id,
          },
        });
      }

      return { type, toBrokerProfileId };
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'lead.transferred',
      resourceType: 'Lead',
      resourceId: leadId,
      metadata: { ...out, reason },
    });
    return { transferred: true, ...out };
  }

  /**
   * Devolve o lead a uma fila (volta ao pool). Encerra a atribuição ativa
   * e marca AWAITING_DISTRIBUTION — pronto para o motor pegar de novo.
   */
  async transferToQueue(
    actor: AuthenticatedUser,
    leadId: string,
    toQueueId: string,
    reason: string,
  ) {
    await this.prisma.tx(async (trx) => {
      await this.lockLead(trx, leadId);

      const lead = await trx.lead.findFirst({
        where: { id: leadId, ...leadScopeWhere(actor) },
        select: { id: true, status: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');

      const queue = await trx.queue.findFirst({
        where: { id: toQueueId },
        select: { id: true },
      });
      if (!queue) throw new BadRequestException('Fila de destino inválida');

      const current = await trx.leadAssignment.findFirst({
        where: { leadId, endedAt: null },
        select: { id: true, brokerProfileId: true },
      });
      if (current) {
        await trx.leadAssignment.update({
          where: { id: current.id },
          data: { endedAt: new Date() },
        });
      }

      await trx.lead.update({
        where: { id: leadId },
        data: { currentQueueId: toQueueId, status: 'AWAITING_DISTRIBUTION' },
      });
      await trx.leadTransfer.create({
        data: {
          tenantId: actor.tenantId,
          leadId,
          type: 'BROKER_TO_QUEUE',
          fromBrokerProfileId: current?.brokerProfileId ?? null,
          toQueueId,
          reason,
          performedById: actor.id,
        },
      });
      await trx.leadStatusHistory.create({
        data: {
          tenantId: actor.tenantId,
          leadId,
          fromStatus: lead.status,
          toStatus: 'AWAITING_DISTRIBUTION',
          reason,
          changedById: actor.id,
        },
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'lead.transferred',
      resourceType: 'Lead',
      resourceId: leadId,
      metadata: { type: 'BROKER_TO_QUEUE', toQueueId, reason },
    });
    return { transferred: true, toQueueId };
  }

  /**
   * Redistribui a carteira ATIVA de um corretor (saiu, foi desligado, de
   * férias). Encerra todas as atribuições ativas e devolve os leads à fila
   * (AWAITING_DISTRIBUTION). Em lote, com operações de conjunto. Se
   * autoDistribute=true, reaplica o motor lead a lead em seguida.
   */
  async redistributeBroker(
    actor: AuthenticatedUser,
    brokerProfileId: string,
    dto: RedistributeDto,
  ) {
    const leadIds = await this.prisma.tx(async (trx) => {
      const broker = await trx.brokerProfile.findFirst({
        where: { id: brokerProfileId },
        select: { id: true },
      });
      if (!broker) throw new NotFoundException('Corretor não encontrado');

      const active = await trx.leadAssignment.findMany({
        where: { brokerProfileId, endedAt: null },
        select: { leadId: true, lead: { select: { status: true } } },
      });
      if (active.length === 0) return [];

      const now = new Date();
      const ids = active.map((a) => a.leadId);

      // 1. encerra todas as atribuições ativas do corretor
      await trx.leadAssignment.updateMany({
        where: { brokerProfileId, endedAt: null },
        data: { endedAt: now },
      });
      // 2. devolve os leads à fila
      await trx.lead.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'AWAITING_DISTRIBUTION',
          ...(dto.toQueueId ? { currentQueueId: dto.toQueueId } : {}),
        },
      });
      // 3. registra a transferência de cada um (sistema/usuário)
      await trx.leadTransfer.createMany({
        data: active.map((a) => ({
          tenantId: actor.tenantId,
          leadId: a.leadId,
          type: 'REDISTRIBUTION' as const,
          fromBrokerProfileId: brokerProfileId,
          toQueueId: dto.toQueueId ?? null,
          reason: dto.reason,
          performedById: actor.id,
        })),
      });
      // 4. histórico de status (preserva o status anterior de cada lead)
      await trx.leadStatusHistory.createMany({
        data: active.map((a) => ({
          tenantId: actor.tenantId,
          leadId: a.leadId,
          fromStatus: a.lead.status,
          toStatus: 'AWAITING_DISTRIBUTION' as const,
          reason: `Redistribuição: ${dto.reason}`,
          changedById: actor.id,
        })),
      });

      return ids;
    });

    // Opcional: já joga no motor (cada chamada é sua própria transação).
    let assigned = 0;
    if (dto.autoDistribute && leadIds.length > 0) {
      for (const leadId of leadIds) {
        const res = await this.distribution.distributeLead(
          actor,
          leadId,
          dto.toQueueId,
        );
        if (res.result === 'ASSIGNED') assigned++;
      }
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'lead.redistributed',
      resourceType: 'BrokerProfile',
      resourceId: brokerProfileId,
      metadata: {
        count: leadIds.length,
        autoDistribute: !!dto.autoDistribute,
        assigned,
        reason: dto.reason,
      },
    });

    return {
      redistributed: leadIds.length,
      autoDistributed: dto.autoDistribute ? assigned : undefined,
    };
  }
}
