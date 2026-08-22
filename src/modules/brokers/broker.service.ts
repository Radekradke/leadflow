import { Injectable, NotFoundException } from '@nestjs/common';
import { BrokerAvailability } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UpdateBrokerDto } from './dto/broker.dto';

@Injectable()
export class BrokerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Meu próprio perfil de corretor. */
  async getMine(user: AuthenticatedUser) {
    const profile = await this.prisma.client.brokerProfile.findFirst({
      where: { userId: user.id },
    });
    if (!profile) throw new NotFoundException('Você não tem perfil de corretor');
    return profile;
  }

  /** O corretor define a PRÓPRIA disponibilidade (sem permissão especial). */
  async setMyAvailability(
    user: AuthenticatedUser,
    availability: BrokerAvailability,
  ) {
    const profile = await this.prisma.client.brokerProfile.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Você não tem perfil de corretor');

    const updated = await this.prisma.client.brokerProfile.update({
      where: { id: profile.id },
      data: { availability },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'broker.availability.changed',
      resourceType: 'BrokerProfile',
      resourceId: profile.id,
      metadata: { availability },
    });
    return updated;
  }

  /** Lista os corretores do tenant (com nome/usuário). Para gestores. */
  async list(_user: AuthenticatedUser) {
    return this.prisma.client.brokerProfile.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Gestor ajusta capacidade e participação na distribuição. */
  async update(user: AuthenticatedUser, id: string, dto: UpdateBrokerDto) {
    const existing = await this.prisma.client.brokerProfile.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Perfil não encontrado');

    const updated = await this.prisma.client.brokerProfile.update({
      where: { id },
      data: {
        maxActiveLeads: dto.maxActiveLeads,
        acceptsDistribution: dto.acceptsDistribution,
      },
    });

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'broker.updated',
      resourceType: 'BrokerProfile',
      resourceId: id,
    });
    return updated;
  }
}
