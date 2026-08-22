import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateInteractionDto,
  createInteractionSchema,
} from './dto/interaction.dto';
import { InteractionService } from './interaction.service';

@Controller('leads/:leadId/interactions')
export class InteractionController {
  constructor(private readonly interactions: InteractionService) {}

  @Post()
  @RequirePermissions('interaction:create')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(createInteractionSchema))
    dto: CreateInteractionDto,
  ) {
    return this.interactions.add(user, leadId, dto);
  }

  @Get()
  @RequirePermissions('lead:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId') leadId: string,
  ) {
    return this.interactions.list(user, leadId);
  }
}
