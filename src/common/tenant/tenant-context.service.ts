import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

type TenantStore = {
  tenantId?: string;
  userId?: string;
};

/**
 * Carrega "quem é o tenant da requisição atual" pela cadeia assíncrona,
 * sem precisar passar isso de mão em mão por todas as funções.
 *
 * Por que AsyncLocalStorage e NÃO um provider REQUEST-scoped do Nest?
 * Provider request-scoped recria a árvore de dependências — e, pior, um
 * PrismaClient novo — a CADA requisição. Isso destrói o pool de conexões
 * em produção. Com ALS, o PrismaClient é singleton e só o CONTEXTO muda
 * por requisição. É o padrão correto.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  /** Abre um contexto novo para a requisição e roda o resto dentro dele. */
  run<T>(store: TenantStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  private getStore(): TenantStore | undefined {
    return this.als.getStore();
  }

  /** Lido pela extensão do Prisma em toda query. */
  getTenantId(): string | undefined {
    return this.getStore()?.tenantId;
  }

  /**
   * Preenchido DEPOIS da autenticação, quando já sabemos quem é o usuário.
   * Mutar o store aqui é seguro: é o MESMO objeto criado no run(), e as
   * queries do Prisma acontecem mais adiante na mesma cadeia assíncrona.
   */
  setTenant(tenantId: string, userId?: string): void {
    const store = this.getStore();
    if (store) {
      store.tenantId = tenantId;
      store.userId = userId;
    }
  }
}
