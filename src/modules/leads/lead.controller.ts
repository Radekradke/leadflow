import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/auth.decorators';
import { RequirePermissions } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ChangeStatusDto,
  CreateLeadDto,
  ListLeadsQuery,
  UpdateLeadDto,
  changeStatusSchema,
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadSchema,
} from './dto/lead.dto';
import { LeadService } from './lead.service';

@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  @RequirePermissions('lead:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createLeadSchema)) dto: CreateLeadDto,
  ) {
    return this.leadService.create(user, dto);
  }

  @Get()
  @RequirePermissions('lead:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: ListLeadsQuery,
  ) {
    return this.leadService.list(user, query);
  }

  @Get(':id')
  @RequirePermissions('lead:read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.leadService.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermissions('lead:update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLeadSchema)) dto: UpdateLeadDto,
  ) {
    return this.leadService.update(user, id, dto);
  }

  @Post(':id/status')
  @RequirePermissions('lead:update')
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) dto: ChangeStatusDto,
  ) {
    return this.leadService.changeStatus(user, id, dto);
  }
}
