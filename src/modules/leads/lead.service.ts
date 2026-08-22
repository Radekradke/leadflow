import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { DistributionService } from '../distribution/distribution.service';
import {
  ChangeStatusDto,
  CreateLeadDto,
  ListLeadsQuery,
  UpdateLeadDto,
} from './dto/lead.dto';
import { canSeeContact, canSeeSensitive, serializeLead } from './lead.masking';
import { leadScopeWhere } from './lead.scope';
import { canTransition, reasonRequired } from './lead-status.machine';

@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly distribution: DistributionService,
  ) {}

  /** Cria o lead e o primeiro registro de histórico (null -> NEW), atômico. */
  async create(user: AuthenticatedUser, dto: CreateLeadDto) {
    // Se veio com fila de entrada, ela precisa existir no tenant (a RLS já
    // limita o findFirst ao tenant atual; FK inválida viraria erro feio).
    if (dto.currentQueueId) {
      const queue = await this.prisma.client.queue.findFirst({
        where: { id: dto.currentQueueId },
        select: { id: true },
      });
      if (!queue) throw new BadRequestException('Fila de entrada inválida');
    }

    const lead = await this.prisma.tx(async (trx) => {
      const created = await trx.lead.create({
        data: {
          ...dto,
          tenantId: user.tenantId, // exigido pela RLS (WITH CHECK)
          status: 'NEW',
        },
      });
      await trx.leadStatusHistory.create({
        data: {
          tenantId: user.tenantId,
          leadId: created.id,
          fromStatus: null,
          toStatus: 'NEW',
          changedById: user.id,
        },
      });
      return created;
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'lead.created',
      resourceType: 'Lead',
      resourceId: lead.id,
    });

    // Distribuição automática SÍNCRONA (não via evento). Roda dentro da
    // mesma requisição, então a RLS enxerga o tenant e a resposta já volta
    // com o lead distribuído. É não-fatal: se a distribuição falhar, o lead
    // continua criado e pode ser distribuído manualmente. (autoDistribute
    // respeita a flag distributionEnabled da fila e nunca lança.)
    if (lead.currentQueueId) {
      try {
        await this.distribution.autoDistribute(user, lead.id);
        const refreshed = await this.prisma.client.lead.findUnique({
          where: { id: lead.id },
        });
        if (refreshed) {
          return serializeLead(refreshed, canSeeSensitive(user), canSeeContact(user));
        }
      } catch {
        // Não-fatal: o lead já está criado. Devolve o lead como está (NEW);
        // ele pode ser distribuído manualmente pela fila.
      }
    }

    return serializeLead(lead, canSeeSensitive(user), canSeeContact(user));
  }

  /** Lista paginada, JÁ filtrada pelo escopo do perfil. CPF sempre mascarado. */
  async list(user: AuthenticatedUser, q: ListLeadsQuery) {
    // Telefone é armazenado só com dígitos (+E.164); se a busca contém
    // dígitos, compara contra a versão sem máscara — "(21) 98888-7777"
    // precisa achar "+5521988887777".
    const searchDigits = q.search?.replace(/\D/g, '') ?? '';
    const where: Prisma.LeadWhereInput = {
      ...leadScopeWhere(user),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: searchDigits || q.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.lead.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.lead.count({ where }),
    ]);

    return {
      items: items.map((lead) => serializeLead(lead, canSeeSensitive(user), canSeeContact(user))),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /**
   * Detalhe de um lead. Aplica o escopo no WHERE (defesa contra IDOR):
   * se o lead existe mas está fora do escopo, devolve 404 — não revela
   * que ele existe. Só audita o acesso SENSÍVEL quando o CPF é de fato
   * exibido (trilha de acesso a dado pessoal, para LGPD).
   */
  async findOne(user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.client.lead.findFirst({
      where: { id, ...leadScopeWhere(user) },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const sensitive = canSeeSensitive(user);
    if (sensitive && lead.cpf) {
      await this.audit.record({
        tenantId: user.tenantId,
        actorId: user.id,
        actorType: 'USER',
        action: 'lead.sensitive.viewed',
        resourceType: 'Lead',
        resourceId: lead.id,
      });
    }

    return serializeLead(lead, sensitive, canSeeContact(user));
  }

  /** Atualiza campos do lead. Confirma o escopo ANTES de editar. */
  async update(user: AuthenticatedUser, id: string, dto: UpdateLeadDto) {
    const inScope = await this.prisma.client.lead.findFirst({
      where: { id, ...leadScopeWhere(user) },
      select: { id: true },
    });
    if (!inScope) throw new NotFoundException('Lead não encontrado');

    const updated = await this.prisma.client.lead.update({
      where: { id },
      data: { ...dto },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'lead.updated',
      resourceType: 'Lead',
      resourceId: id,
    });

    return serializeLead(updated, canSeeSensitive(user), canSeeContact(user));
  }

  /**
   * Move o lead pelo funil. Valida a transição (máquina de estados),
   * exige motivo p/ LOST/ARCHIVED, checa a permissão lead:archive para
   * encerrar, e grava o histórico — tudo atômico.
   */
  async changeStatus(
    user: AuthenticatedUser,
    id: string,
    dto: ChangeStatusDto,
  ) {
    const lead = await this.prisma.client.lead.findFirst({
      where: { id, ...leadScopeWhere(user) },
      select: { id: true, status: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const from = lead.status;
    const to = dto.status;

    if (from === to) {
      throw new BadRequestException('O lead já está nesse status');
    }
    if (!canTransition(from, to)) {
      throw new BadRequestException(`Transição inválida: ${from} → ${to}`);
    }
    if (reasonRequired(to) && !dto.reason?.trim()) {
      throw new BadRequestException('Motivo é obrigatório para este status');
    }
    if (
      (to === 'LOST' || to === 'ARCHIVED') &&
      !user.permissions.includes('lead:archive')
    ) {
      throw new ForbiddenException(
        'Sem permissão para encerrar/arquivar leads',
      );
    }

    const updated = await this.prisma.tx(async (trx) => {
      const u = await trx.lead.update({ where: { id }, data: { status: to } });
      await trx.leadStatusHistory.create({
        data: {
          tenantId: user.tenantId,
          leadId: id,
          fromStatus: from,
          toStatus: to,
          reason: dto.reason,
          changedById: user.id,
        },
      });
      return u;
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'lead.status.changed',
      resourceType: 'Lead',
      resourceId: id,
      metadata: { from, to },
    });

    return serializeLead(updated, canSeeSensitive(user), canSeeContact(user));
  }
}
