import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  SetAvailabilityDto,
  UpdateBrokerDto,
  setAvailabilitySchema,
  updateBrokerSchema,
} from './dto/broker.dto';
import { BrokerService } from './broker.service';

@Controller('brokers')
export class BrokerController {
  constructor(private readonly brokers: BrokerService) {}

  // Rotas "me": só autenticação, sem permissão especial — é sobre si mesmo.
  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.brokers.getMine(user);
  }

  @Patch('me/availability')
  setMyAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setAvailabilitySchema)) dto: SetAvailabilityDto,
  ) {
    return this.brokers.setMyAvailability(user, dto.availability);
  }

  @Get()
  @RequirePermissions('user:read')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.brokers.list(user);
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBrokerSchema)) dto: UpdateBrokerDto,
  ) {
    return this.brokers.update(user, id, dto);
  }
}
