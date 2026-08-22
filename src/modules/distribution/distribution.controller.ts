import {
  Body,
  Controller,
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
  DistributeLeadDto,
  QueueConfigDto,
  distributeLeadSchema,
  queueConfigSchema,
} from './dto/distribution.dto';
import { DistributionService } from './distribution.service';

/** Disparar a distribuição de UM lead. Aninhado sob o lead. */
@Controller('leads/:leadId')
export class LeadDistributionController {
  constructor(private readonly distribution: DistributionService) {}

  @Post('distribute')
  @RequirePermissions('distribution:run_manual')
  distribute(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(distributeLeadSchema)) dto: DistributeLeadDto,
  ) {
    return this.distribution.distributeLead(actor, leadId, dto.queueId);
  }
}

/** Configuração e observabilidade da distribuição por fila. */
@Controller('distribution')
export class DistributionController {
  constructor(private readonly distribution: DistributionService) {}

  @Patch('queues/:queueId/config')
  @RequirePermissions('distribution:configure')
  config(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('queueId') queueId: string,
    @Body(new ZodValidationPipe(queueConfigSchema)) dto: QueueConfigDto,
  ) {
    return this.distribution.setQueueConfig(actor, queueId, dto);
  }

  @Get('queues/:queueId/logs')
  @RequirePermissions('distribution:configure')
  logs(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('queueId') queueId: string,
  ) {
    return this.distribution.queueLogs(actor, queueId);
  }
}
