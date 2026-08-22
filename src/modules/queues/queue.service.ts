import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateQueueDto, UpdateQueueDto } from './dto/queue.dto';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateQueueDto) {
    const queue = await this.prisma.client.queue.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        isActive: dto.isActive ?? true,
        parentId: dto.parentId ?? null,
        routingWeight: dto.routingWeight ?? 50,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'queue.created',
      resourceType: 'Queue',
      resourceId: queue.id,
    });
    return queue;
  }

  async list(_user: AuthenticatedUser) {
    return this.prisma.client.queue.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateQueueDto) {
    const existing = await this.prisma.client.queue.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Fila não encontrada');

    // Trocar a fila-pai exige cuidado: uma fila não pode virar filha dela
    // mesma nem de uma descendente — isso criaria um ciclo e a distribuição
    // rodaria em círculo.
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('Uma fila não pode ser pai dela mesma.');
      }
      const parent = await this.prisma.client.queue.findFirst({
        where: { id: dto.parentId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Fila-pai não encontrada');
      if (await this.isDescendant(dto.parentId, id)) {
        throw new BadRequestException(
          'Essa fila já está abaixo da atual — mudaria a cadeia para um ciclo.',
        );
      }
    }

    const updated = await this.prisma.client.queue.update({
      where: { id },
      data: {
        name: dto.name,
        isActive: dto.isActive,
        routingWeight: dto.routingWeight,
        distributionEnabled: dto.distributionEnabled,
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'queue.updated',
      resourceType: 'Queue',
      resourceId: id,
    });
    return updated;
  }

  /** `candidateId` está em algum lugar ABAIXO de `ancestorId`? */
  private async isDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
    let currentId: string | null = candidateId;
    for (let depth = 0; depth < 10 && currentId; depth++) {
      const node = await this.prisma.client.queue.findFirst({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!node?.parentId) return false;
      if (node.parentId === ancestorId) return true;
      currentId = node.parentId;
    }
    return false;
  }

  // ── Roteamento por anúncio (Click-to-WhatsApp) ──────────────
  async listAdRoutes(user: AuthenticatedUser) {
    return this.prisma.client.adRoute.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        adSourceId: true,
        label: true,
        queueId: true,
        queue: { select: { id: true, name: true } },
      },
    });
  }

  async upsertAdRoute(
    user: AuthenticatedUser,
    dto: { adSourceId: string; queueId: string; label?: string },
  ) {
    const queue = await this.prisma.client.queue.findFirst({
      where: { id: dto.queueId },
      select: { id: true },
    });
    if (!queue) throw new NotFoundException('Fila não encontrada');

    const route = await this.prisma.client.adRoute.upsert({
      where: {
        tenantId_adSourceId: { tenantId: user.tenantId, adSourceId: dto.adSourceId },
      },
      create: {
        tenantId: user.tenantId,
        adSourceId: dto.adSourceId,
        queueId: dto.queueId,
        label: dto.label ?? null,
      },
      update: { queueId: dto.queueId, label: dto.label ?? null },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'adroute.upsert',
      resourceType: 'AdRoute',
      resourceId: route.id,
    });
    return route;
  }

  async removeAdRoute(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.client.adRoute.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Roteamento não encontrado');
    await this.prisma.client.adRoute.delete({ where: { id } });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'adroute.delete',
      resourceType: 'AdRoute',
      resourceId: id,
    });
    return { ok: true };
  }

  async addMember(
    user: AuthenticatedUser,
    queueId: string,
    brokerProfileId: string,
  ) {
    // Fila e corretor precisam existir NO tenant (RLS escopa o findFirst).
    const queue = await this.prisma.client.queue.findFirst({
      where: { id: queueId },
      select: { id: true },
    });
    if (!queue) throw new NotFoundException('Fila não encontrada');

    const broker = await this.prisma.client.brokerProfile.findFirst({
      where: { id: brokerProfileId },
      select: { id: true },
    });
    if (!broker) throw new NotFoundException('Corretor não encontrado');

    try {
      const membership = await this.prisma.client.queueMembership.create({
        data: { tenantId: user.tenantId, queueId, brokerProfileId },
      });
      await this.audit.record({
        tenantId: user.tenantId,
        actorId: user.id,
        actorType: 'USER',
        action: 'queue.member.added',
        resourceType: 'Queue',
        resourceId: queueId,
        metadata: { brokerProfileId },
      });
      return membership;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Corretor já está nesta fila');
      }
      throw e;
    }
  }

  async removeMember(
    user: AuthenticatedUser,
    queueId: string,
    brokerProfileId: string,
  ) {
    const res = await this.prisma.client.queueMembership.deleteMany({
      where: { queueId, brokerProfileId },
    });
    if (res.count === 0) throw new NotFoundException('Vínculo não encontrado');

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'queue.member.removed',
      resourceType: 'Queue',
      resourceId: queueId,
      metadata: { brokerProfileId },
    });
    return { removed: true };
  }

  async listMembers(_user: AuthenticatedUser, queueId: string) {
    const queue = await this.prisma.client.queue.findFirst({
      where: { id: queueId },
      select: { id: true },
    });
    if (!queue) throw new NotFoundException('Fila não encontrada');

    return this.prisma.client.queueMembership.findMany({
      where: { queueId },
      include: {
        brokerProfile: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }
}
