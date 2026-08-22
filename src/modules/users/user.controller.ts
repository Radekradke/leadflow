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
  CreateUserDto,
  ListUsersQuery,
  SetActiveDto,
  UpdateUserDto,
  createUserSchema,
  listUsersQuerySchema,
  setActiveSchema,
  updateUserSchema,
} from './dto/user.dto';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Post()
  @RequirePermissions('user:create')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
  ) {
    return this.users.create(actor, dto);
  }

  @Get()
  @RequirePermissions('user:read')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) q: ListUsersQuery,
  ) {
    return this.users.list(actor, q);
  }

  @Get(':id')
  @RequirePermissions('user:read')
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.users.findOne(actor, id);
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Patch(':id/active')
  @RequirePermissions('user:deactivate')
  setActive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setActiveSchema)) dto: SetActiveDto,
  ) {
    return this.users.setActive(actor, id, dto.isActive);
  }
}
