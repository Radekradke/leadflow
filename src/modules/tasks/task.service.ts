import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { leadScopeWhere } from '../leads/lead.scope';
import { CreateTaskDto, ListTasksQuery } from './dto/task.dto';

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    // Se a tarefa aponta para um lead, ele precisa estar no escopo.
    if (dto.leadId) {
      const lead = await this.prisma.client.lead.findFirst({
        where: { id: dto.leadId, ...leadScopeWhere(user) },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException('Lead não encontrado');
    }

    // Se atribui a outra pessoa, ela precisa existir NO MESMO tenant.
    // A RLS já limita o findFirst ao tenant atual: se não achar, recusa.
    const assignedToUserId = dto.assignedToUserId ?? user.id;
    if (assignedToUserId !== user.id) {
      const target = await this.prisma.client.user.findFirst({
        where: { id: assignedToUserId },
        select: { id: true },
      });
      if (!target) {
        throw new BadRequestException('Usuário de destino inválido');
      }
    }

    const task = await this.prisma.client.task.create({
      data: {
        tenantId: user.tenantId,
        leadId: dto.leadId,
        assignedToUserId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt,
        createdById: user.id,
      },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'task.created',
      resourceType: 'Task',
      resourceId: task.id,
    });

    return task;
  }

  /** Minhas tarefas (atribuídas a mim). Pendentes primeiro, por vencimento. */
  async listMine(user: AuthenticatedUser, q: ListTasksQuery) {
    const where = {
      assignedToUserId: user.id,
      ...(q.status ? { status: q.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.task.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      }),
      this.prisma.client.task.count({ where }),
    ]);

    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /**
   * Concluir tarefa. Sem task:manage, só dá para concluir a SUA própria
   * tarefa (o assignee). Com task:manage, qualquer uma do tenant.
   */
  async complete(user: AuthenticatedUser, id: string) {
    const canManageAny = user.permissions.includes('task:manage');
    const where = canManageAny
      ? { id }
      : { id, assignedToUserId: user.id };

    const task = await this.prisma.client.task.findFirst({
      where,
      select: { id: true, status: true },
    });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    if (task.status !== 'PENDING') {
      throw new BadRequestException('Tarefa não está pendente');
    }

    const updated = await this.prisma.client.task.update({
      where: { id },
      data: { status: 'DONE', completedAt: new Date() },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'task.completed',
      resourceType: 'Task',
      resourceId: id,
    });

    return updated;
  }
}
