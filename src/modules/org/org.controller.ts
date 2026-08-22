import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateDepartmentDto,
  CreateTeamDto,
  ListTeamsQuery,
  UpdateDepartmentDto,
  UpdateTeamDto,
  createDepartmentSchema,
  createTeamSchema,
  listTeamsQuerySchema,
  updateDepartmentSchema,
  updateTeamSchema,
} from './dto/org.dto';
import { OrgService } from './org.service';

@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  // ── Departamentos ──
  @Post('departments')
  @RequirePermissions('team:manage')
  createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDepartmentSchema))
    dto: CreateDepartmentDto,
  ) {
    return this.org.createDepartment(user, dto);
  }

  @Get('departments')
  @RequirePermissions('team:read')
  listDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.org.listDepartments(user);
  }

  @Patch('departments/:id')
  @RequirePermissions('team:manage')
  updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema))
    dto: UpdateDepartmentDto,
  ) {
    return this.org.updateDepartment(user, id, dto);
  }

  // ── Equipes ──
  @Post('teams')
  @RequirePermissions('team:manage')
  createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTeamSchema)) dto: CreateTeamDto,
  ) {
    return this.org.createTeam(user, dto);
  }

  @Get('teams')
  @RequirePermissions('team:read')
  listTeams(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listTeamsQuerySchema)) query: ListTeamsQuery,
  ) {
    return this.org.listTeams(user, query);
  }

  @Patch('teams/:id')
  @RequirePermissions('team:manage')
  updateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTeamSchema)) dto: UpdateTeamDto,
  ) {
    return this.org.updateTeam(user, id, dto);
  }
}
