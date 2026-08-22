import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  AddMemberDto,
  CreateQueueDto,
  UpdateQueueDto,
  addMemberSchema,
  createQueueSchema,
  updateQueueSchema,
  UpsertAdRouteDto,
  upsertAdRouteSchema,
} from './dto/queue.dto';
import { QueueService } from './queue.service';

@Controller('queues')
export class QueueController {
  constructor(private readonly queues: QueueService) {}

  @Post()
  @RequirePermissions('queue:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createQueueSchema)) dto: CreateQueueDto,
  ) {
    return this.queues.create(user, dto);
  }

  @Get()
  @RequirePermissions('queue:read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.queues.list(user);
  }

  @Patch(':id')
  @RequirePermissions('queue:manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQueueSchema)) dto: UpdateQueueDto,
  ) {
    return this.queues.update(user, id, dto);
  }

  @Get(':id/members')
  @RequirePermissions('queue:read')
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.queues.listMembers(user, id);
  }

  @Post(':id/members')
  @RequirePermissions('queue:manage')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberDto,
  ) {
    return this.queues.addMember(user, id, dto.brokerProfileId);
  }

  @Delete(':id/members/:brokerProfileId')
  @RequirePermissions('queue:manage')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('brokerProfileId') brokerProfileId: string,
  ) {
    return this.queues.removeMember(user, id, brokerProfileId);
  }

  // ── Roteamento por anúncio ──────────────────────────────────
  @RequirePermissions('queue:read')
  @Get('ad-routes/all')
  listAdRoutes(@CurrentUser() user: AuthenticatedUser) {
    return this.queues.listAdRoutes(user);
  }

  @RequirePermissions('queue:manage')
  @Post('ad-routes')
  upsertAdRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertAdRouteSchema)) dto: UpsertAdRouteDto,
  ) {
    return this.queues.upsertAdRoute(user, dto);
  }

  @RequirePermissions('queue:manage')
  @Delete('ad-routes/:id')
  removeAdRoute(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.queues.removeAdRoute(user, id);
  }
}
