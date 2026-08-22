import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  RedistributeDto,
  TransferToBrokerDto,
  TransferToQueueDto,
  redistributeSchema,
  transferToBrokerSchema,
  transferToQueueSchema,
} from './dto/transfer.dto';
import { TransferService } from './transfer.service';

@Controller()
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Post('leads/:leadId/transfer/broker')
  @RequirePermissions('lead:transfer')
  toBroker(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(transferToBrokerSchema))
    dto: TransferToBrokerDto,
  ) {
    return this.transfers.transferToBroker(
      actor,
      leadId,
      dto.toBrokerProfileId,
      dto.reason,
    );
  }

  @Post('leads/:leadId/transfer/queue')
  @RequirePermissions('lead:transfer')
  toQueue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(transferToQueueSchema)) dto: TransferToQueueDto,
  ) {
    return this.transfers.transferToQueue(
      actor,
      leadId,
      dto.toQueueId,
      dto.reason,
    );
  }

  // Reatribuir toda a carteira de um corretor (saída/desligamento/férias).
  @Post('brokers/:brokerProfileId/redistribute')
  @RequirePermissions('lead:transfer')
  redistribute(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('brokerProfileId') brokerProfileId: string,
    @Body(new ZodValidationPipe(redistributeSchema)) dto: RedistributeDto,
  ) {
    return this.transfers.redistributeBroker(actor, brokerProfileId, dto);
  }
}
