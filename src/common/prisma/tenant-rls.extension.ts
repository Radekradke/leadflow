import { PrismaClient } from '@prisma/client';

/** Operações cruas: não embrulhamos (evita recursão do nosso set_config). */
const RAW_OPERATIONS = new Set([
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
]);

/**
 * Estende um PrismaClient para que TODA operação rode dentro de uma
 * transação que primeiro fixa o tenant da sessão no Postgres:
 *
 *     SELECT set_config('app.current_tenant', <tenantId>, true);
 *
 * É esse set_config que "liga" as políticas de RLS criadas na migration.
 * O `true` torna o valor local à transação — ele não vaza para a próxima
 * requisição que reutilizar a mesma conexão do pool.
 *
 * `getTenantId` é uma FUNÇÃO (não um valor): ela é lida em tempo de
 * execução e devolve o tenant da requisição atual, vindo do
 * AsyncLocalStorage. Assim mantemos UM client singleton e só o contexto
 * muda a cada requisição.
 */
export function extendClientForTenant(
  base: PrismaClient,
  getTenantId: () => string | undefined,
) {
  // A extensão precisa do PRÓPRIO client estendido para abrir a
  // transação. A self-referência é resolvida em tempo de chamada,
  // depois que `extended` já foi atribuído.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extended: any;

  extended = base.$extends({
    query: {
      async $allOperations({ args, query, operation }) {
        const tenantId = getTenantId();

        // Operação crua -> passa direto. Isso também QUEBRA a recursão:
        // o nosso próprio set_config abaixo é um $executeRaw e cairia
        // aqui de novo; o guard o deixa seguir sem re-embrulhar.
        if (RAW_OPERATIONS.has(operation)) {
          return query(args);
        }

        // Sem tenant no contexto -> deixa correr. A RLS, sem
        // app.current_tenant setado, não casa nenhuma linha e devolve
        // VAZIO (fail-closed). Nunca retorna dado de outro tenant.
        if (!tenantId) {
          return query(args);
        }

        // set_config + a query na MESMA transação => mesma conexão =>
        // a política de RLS enxerga o tenant certo no momento da query.
        // (o valor de tenantId é parametrizado: sem risco de injeção)
        const [, result] = await extended.$transaction([
          extended.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  });

  return extended;
}

export type TenantPrismaClient = ReturnType<typeof extendClientForTenant>;
