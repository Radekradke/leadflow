import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashPassword } from '../../common/security/password';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateUserDto,
  ListUsersQuery,
  UpdateUserDto,
} from './dto/user.dto';

// Nunca devolve passwordHash. Tudo que sai da API passa por aqui.
const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  teamId: true,
  createdAt: true,
  role: { select: { type: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve o id da role daquele tipo NO tenant atual (RLS já escopa). */
  private async resolveRoleId(type: RoleType): Promise<string> {
    const role = await this.prisma.client.role.findFirst({
      where: { type },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Perfil (role) não encontrado');
    return role.id;
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const roleId = await this.resolveRoleId(dto.roleType);
    const passwordHash = await hashPassword(dto.password);

    try {
      const created = await this.prisma.tx(async (trx) => {
        const u = await trx.user.create({
          data: {
            tenantId: actor.tenantId,
            name: dto.name,
            email: dto.email,
            passwordHash,
            roleId,
            teamId: dto.teamId,
          },
          select: SAFE_SELECT,
        });
        // Corretor já nasce com perfil de corretor (disponibilidade etc.).
        if (dto.roleType === RoleType.BROKER) {
          await trx.brokerProfile.create({
            data: { tenantId: actor.tenantId, userId: u.id },
          });
        }
        return u;
      });

      await this.audit.record({
        tenantId: actor.tenantId,
        actorId: actor.id,
        actorType: 'USER',
        action: 'user.created',
        resourceType: 'User',
        resourceId: created.id,
      });
      return created;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('E-mail já cadastrado');
      }
      throw e;
    }
  }

  async list(_actor: AuthenticatedUser, q: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.roleType ? { role: { type: q.roleType } } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        select: SAFE_SELECT,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.user.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async findOne(_actor: AuthenticatedUser, id: string) {
    const user = await this.prisma.client.user.findFirst({
      where: { id },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.client.user.findFirst({
      where: { id },
      select: { id: true, role: { select: { type: true } } },
    });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.teamId !== undefined) data.teamId = dto.teamId;

    let newRoleType = existing.role.type;
    if (dto.roleType !== undefined) {
      data.roleId = await this.resolveRoleId(dto.roleType);
      newRoleType = dto.roleType;
    }

    const updated = await this.prisma.tx(async (trx) => {
      const u = await trx.user.update({
        where: { id },
        data,
        select: SAFE_SELECT,
      });
      // Virou corretor e ainda não tem perfil? cria.
      if (newRoleType === RoleType.BROKER) {
        const profile = await trx.brokerProfile.findUnique({
          where: { userId: id },
          select: { id: true },
        });
        if (!profile) {
          await trx.brokerProfile.create({
            data: { tenantId: actor.tenantId, userId: id },
          });
        }
      }
      return u;
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'user.updated',
      resourceType: 'User',
      resourceId: id,
    });
    return updated;
  }

  async setActive(actor: AuthenticatedUser, id: string, isActive: boolean) {
    const existing = await this.prisma.client.user.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    const updated = await this.prisma.client.user.update({
      where: { id },
      data: { isActive },
      select: SAFE_SELECT,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorType: 'USER',
      action: isActive ? 'user.activated' : 'user.deactivated',
      resourceType: 'User',
      resourceId: id,
    });
    return updated;
  }
}
