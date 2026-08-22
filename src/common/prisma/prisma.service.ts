import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  extendClientForTenant,
  TenantPrismaClient,
} from './tenant-rls.extension';

/**
 * Cliente de RUNTIME — usado por TODOS os módulos que tocam dados de
 * tenant (usuários, leads, filas, etc.).
 *
 * Conecta com o papel `leadflow_app` (APP_DATABASE_URL): NÃO é dono das
 * tabelas e NÃO tem BYPASSRLS, logo está SUJEITO às políticas de RLS.
 * A extensão injeta o tenant da requisição em cada query.
 *
 * Nos services, use sempre: `this.prisma.client.<modelo>.<operação>(...)`.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly base: PrismaClient;

  /** Cliente estendido (tenant-aware). É este que os services usam. */
  public readonly client: TenantPrismaClient;

  constructor(private readonly tenantContext: TenantContextService) {
    this.base = new PrismaClient({
      // Conexão de runtime: papel restrito, sujeito à RLS.
      datasources: { db: { url: process.env.APP_DATABASE_URL } },
      log: ['warn', 'error'],
    });

    this.client = extendClientForTenant(this.base, () =>
      this.tenantContext.getTenantId(),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
    this.logger.log('Prisma (runtime, sujeito à RLS) conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  /**
   * Executa várias operações numa transação ÚNICA, com o tenant fixado
   * UMA vez. Use isto sempre que precisar de atomicidade (ex.: criar lead
   * + histórico de status juntos).
   *
   * Por que não usar `this.client.$transaction`? A extensão de RLS
   * embrulha CADA operação na sua própria transação. Dentro de uma
   * transação interativa isso viraria transação aninhada (não suportada).
   * Aqui usamos o client BASE (sem extensão) e setamos o tenant na mão,
   * uma vez — as operações de `trx` já saem RLS-scoped, sem aninhar.
   */
  async tx<T>(fn: (trx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tenantId = this.tenantContext.getTenantId();
    return this.base.$transaction(async (trx) => {
      if (tenantId) {
        await trx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      }
      return fn(trx);
    });
  }
}
