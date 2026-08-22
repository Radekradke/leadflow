import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

/**
 * PrismaService (runtime, RLS) e AuditService vêm de módulos @Global
 * (PrismaModule e AuditModule), então não precisam ser importados aqui.
 *
 * DistributionModule é importado para distribuir o lead SÍNCRONO na criação
 * (no mesmo contexto da requisição — a RLS enxerga o tenant). Não há ciclo:
 * DistributionService não depende de LeadService.
 */
@Module({
  imports: [DistributionModule],
  controllers: [LeadController],
  providers: [LeadService],
})
export class LeadModule {}
