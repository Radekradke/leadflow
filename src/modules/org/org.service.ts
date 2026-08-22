import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateDepartmentDto,
  CreateTeamDto,
  ListTeamsQuery,
  UpdateDepartmentDto,
  UpdateTeamDto,
} from './dto/org.dto';

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Departamentos ─────────────────────────────────────────

  async createDepartment(user: AuthenticatedUser, dto: CreateDepartmentDto) {
    const dept = await this.prisma.client.department.create({
      data: { tenantId: user.tenantId, name: dto.name },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'department.created',
      resourceType: 'Department',
      resourceId: dept.id,
    });
    return dept;
  }

  listDepartments(_user: AuthenticatedUser) {
    return this.prisma.client.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { teams: true } } },
    });
  }

  async updateDepartment(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    const exists = await this.prisma.client.department.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Departamento não encontrado');

    const dept = await this.prisma.client.department.update({
      where: { id },
      data: { name: dto.name },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'department.updated',
      resourceType: 'Department',
      resourceId: id,
    });
    return dept;
  }

  // ── Equipes ───────────────────────────────────────────────

  async createTeam(user: AuthenticatedUser, dto: CreateTeamDto) {
    // O departamento precisa existir no tenant (RLS limita o findFirst).
    const dept = await this.prisma.client.department.findFirst({
      where: { id: dto.departmentId },
      select: { id: true },
    });
    if (!dept) throw new BadRequestException('Departamento inválido');

    const team = await this.prisma.client.team.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        departmentId: dto.departmentId,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'team.created',
      resourceType: 'Team',
      resourceId: team.id,
    });
    return team;
  }

  listTeams(_user: AuthenticatedUser, q: ListTeamsQuery) {
    return this.prisma.client.team.findMany({
      where: q.departmentId ? { departmentId: q.departmentId } : {},
      orderBy: { name: 'asc' },
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async updateTeam(user: AuthenticatedUser, id: string, dto: UpdateTeamDto) {
    const team = await this.prisma.client.team.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('Equipe não encontrada');

    if (dto.departmentId) {
      const dept = await this.prisma.client.department.findFirst({
        where: { id: dto.departmentId },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Departamento inválido');
    }

    const updated = await this.prisma.client.team.update({
      where: { id },
      data: { name: dto.name, departmentId: dto.departmentId },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'team.updated',
      resourceType: 'Team',
      resourceId: id,
    });
    return updated;
  }
}
