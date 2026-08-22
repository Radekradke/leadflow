import { Module } from '@nestjs/common';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';

/**
 * PrismaService (runtime, RLS) e AuditService vêm de módulos @Global
 * (PrismaModule e AuditModule), então não precisam ser importados aqui.
 */
@Module({
  controllers: [LeadController],
  providers: [LeadService],
})
export class LeadModule {}
