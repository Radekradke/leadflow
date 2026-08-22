import { RoleType } from '@prisma/client';

/**
 * Conteúdo assinado dentro do access token (JWT).
 * Mantemos enxuto e SEM dado sensível — só o necessário para autorizar.
 * As permissões vão aqui para o guard não precisar bater no banco a cada
 * requisição. Custo: ficam "congeladas" até o token expirar (~15 min).
 * Como o token é curto, essa defasagem é aceitável.
 */
export type JwtPayload = {
  sub: string; // id do usuário
  tenantId: string;
  teamId: string | null;
  roleType: RoleType;
  permissions: string[];
};

/**
 * O que vive em request.user depois da autenticação.
 * É lido pelo PermissionsGuard, pelo @CurrentUser, pelo
 * TenantContextInterceptor (id e tenantId) e pelo ESCOPO de leads
 * (roleType + teamId definem o que cada um enxerga).
 */
export type AuthenticatedUser = {
  id: string;
  tenantId: string;
  teamId: string | null;
  roleType: RoleType;
  permissions: string[];
};
