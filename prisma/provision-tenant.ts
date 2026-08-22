import { Prisma, PrismaClient, RoleType, TenantStatus } from '@prisma/client';
import { ROLE_LABELS, ROLE_TEMPLATE } from './rbac-catalog';

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  planId: string;
  status?: TenantStatus;
  admin: {
    name: string;
    email: string;
    passwordHash: string; // já hasheado (Argon2id) — esta função não hasheia
  };
}

/**
 * Cria um tenant COMPLETO e pronto para uso, de forma ATÔMICA:
 *   1. o Tenant
 *   2. as 7 roles do tenant (a partir do template)
 *   3. o vínculo role -> permissions (com tenantId denormalizado p/ RLS)
 *   4. o usuário ADMIN do tenant
 *
 * Tudo numa transação: ou nasce um tenant inteiro e consistente, ou nada.
 * Um tenant "pela metade" (sem admin, sem roles) é pior que nenhum.
 *
 * ⚠️ Deve SEMPRE rodar no cliente ELEVADO (DATABASE_URL / BYPASSRLS):
 * ela escreve linhas de um tenant que ainda não existe no contexto da
 * sessão. É o mesmo motivo de o seed atravessar a RLS. No runtime, quem
 * a chama é o módulo de plataforma (via PlatformPrismaService).
 */
export async function provisionTenant(
  prisma: PrismaClient,
  input: ProvisionTenantInput,
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        planId: input.planId,
        status: input.status ?? TenantStatus.TRIAL,
      },
    });

    // Mapa key -> id de TODAS as permissions (catálogo global já semeado).
    const allPermissions = await tx.permission.findMany({
      select: { id: true, key: true },
    });
    const permIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

    let adminRoleId: string | null = null;

    for (const type of Object.values(RoleType)) {
      const role = await tx.role.create({
        data: { tenantId: tenant.id, type, name: ROLE_LABELS[type] },
      });
      if (type === RoleType.ADMIN) adminRoleId = role.id;

      const rows = ROLE_TEMPLATE[type]
        .map((key) => permIdByKey.get(key))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({
          tenantId: tenant.id, // denormalizado: a política de RLS lê daqui
          roleId: role.id,
          permissionId,
        }));

      if (rows.length) {
        await tx.rolePermission.createMany({ data: rows });
      }
    }

    if (!adminRoleId) {
      throw new Error('Role ADMIN não foi criada — template de roles inconsistente');
    }

    const adminUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.admin.email,
        name: input.admin.name,
        passwordHash: input.admin.passwordHash,
        roleId: adminRoleId,
      },
    });

    return { tenant, adminUser };
  });
}
