import { Global, Module } from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PrismaService } from './prisma.service';
import { PlatformPrismaService } from './platform-prisma.service';

/**
 * @Global para não precisar reimportar em cada módulo de feature.
 * Exporta:
 *   - TenantContextService : contexto de tenant da requisição
 *   - PrismaService        : cliente de runtime (RLS) — uso geral
 *   - PlatformPrismaService: cliente elevado — só plataforma/auth/seed
 */
@Global()
@Module({
  providers: [TenantContextService, PrismaService, PlatformPrismaService],
  exports: [TenantContextService, PrismaService, PlatformPrismaService],
})
export class PrismaModule {}
