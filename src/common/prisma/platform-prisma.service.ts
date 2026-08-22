import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * ⚠️  CLIENTE ELEVADO — IGNORA A RLS.  ⚠️
 *
 * Conecta com o usuário do DATABASE_URL (owner / BYPASSRLS). Enxerga
 * TODOS os tenants. Existe para o PLANO DA PLATAFORMA:
 *   - criar/suspender tenants
 *   - gerenciar planos
 *   - rodar o onboarding (criar o tenant + seu admin)
 *   - o login (descobrir o tenant a partir do e-mail — ver nota abaixo)
 *
 * REGRA DE OURO: NUNCA injete este serviço em módulos que atendem
 * tenants (leads, filas, usuários do tenant...). Ele só pode aparecer
 * no módulo de plataforma, no de auth (lookup de login) e no seed.
 * Injetá-lo no lugar errado reabre exatamente o vazamento que a RLS
 * existe para impedir.
 *
 * Como não tem extensão, usa-se direto: `this.platformPrisma.<modelo>...`.
 */
@Injectable()
export class PlatformPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PlatformPrismaService.name);

  constructor() {
    super({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.warn(
      'Prisma ELEVADO (sem RLS) conectado — uso restrito ao plano de plataforma',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
