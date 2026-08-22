import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import { SkipCsrf } from '../../common/auth/csrf.guard';
import { PlatformPrismaService } from '../../common/prisma/platform-prisma.service';

/**
 * Health checks. Públicos e isentos de CSRF (sem sessão). Usados por
 * Render/Railway/uptime monitors para saber se o serviço está de pé.
 *
 *  - GET /health        → liveness: o processo respondeu? (rápido)
 *  - GET /health/ready  → readiness: o banco respondeu? (faz SELECT 1)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: PlatformPrismaService) {}

  @Public()
  @SkipCsrf()
  @Get()
  liveness() {
    return { status: 'ok', uptime: Math.round(process.uptime()), ts: new Date().toISOString() };
  }

  @Public()
  @SkipCsrf()
  @Get('ready')
  async readiness() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'degraded', db: 'down' };
    }
  }
}
