import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { leadScopeWhere } from '../leads/lead.scope';
import { CreateInteractionDto } from './dto/interaction.dto';

@Injectable()
export class InteractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Garante que o lead existe E está no escopo do usuário (anti-IDOR). */
  private async assertLeadInScope(user: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.client.lead.findFirst({
      where: { id: leadId, ...leadScopeWhere(user) },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
  }

  async add(user: AuthenticatedUser, leadId: string, dto: CreateInteractionDto) {
    await this.assertLeadInScope(user, leadId);

    const interaction = await this.prisma.tx(async (trx) => {
      const created = await trx.interaction.create({
        data: {
          tenantId: user.tenantId,
          leadId,
          type: dto.type,
          outcome: dto.outcome,
          content: dto.content,
          createdById: user.id,
        },
      });
      // registrar contato move a régua de "último contato" do lead
      await trx.lead.update({
        where: { id: leadId },
        data: { lastContactAt: new Date() },
      });
      return created;
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'lead.interaction.created',
      resourceType: 'Lead',
      resourceId: leadId,
    });

    return interaction;
  }

  async list(user: AuthenticatedUser, leadId: string) {
    await this.assertLeadInScope(user, leadId);
    return this.prisma.client.interaction.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
