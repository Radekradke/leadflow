import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** @Global: qualquer módulo pode injetar AuditService sem reimportar. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
