import { PrismaClient, RoleType } from '@prisma/client';
import {
  PERMISSION_CATALOG,
  ROLE_LABELS,
  permissionsForRole,
} from '../../../common/rbac/permissions';

export type OnboardTenantInput = {
  tenantName: string;
  tenantSlug: string;
  planId: string;
  admin: {
    name: string;
    email: string;
    passwordHash: string; // JÁ com hash (Argon2) — esta função não hasheia
  };
};

/**
 * Sincroniza o catálogo GLOBAL de permissões no banco. Idempotente:
 * pode rodar quantas vezes quiser (no seed e, no futuro, no deploy).
 */
export async function syncPermissions(db: PrismaClient): Promise<void> {
  for (const p of PERMISSION_CATALOG) {
    await db.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: { key: p.key, description: p.description },
    });
  }
}

/**
 * Cria um tenant COMPLETO, de forma ATÔMICA (tudo ou nada):
 *   1. o Tenant
 *   2. suas 7 roles, cada uma já mapeada às permissões certas
 *   3. o usuário ADMINISTRADOR do tenant
 *
 * Recebe um client ELEVADO (que bypassa RLS), porque está criando dados
 * de um tenant que ainda não existe no contexto da sessão — a RLS, se
 * aplicada, bloquearia o WITH CHECK. Em produção quem chama é o módulo
 * de plataforma (PlatformPrismaService); no seed, o client owner.
 *
 * Pré-condição: syncPermissions já populou o catálogo global.
 *
 * É a MESMA função que o cadastro de um novo cliente (signup) vai usar
 * mais tarde — por isso vive aqui, e não solta dentro do seed.
 */
export async function onboardTenant(db: PrismaClient, input: OnboardTenantInput) {
  return db.$transaction(async (tx) => {
    // 1. Tenant
    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
        planId: input.planId,
        status: 'TRIAL',
      },
    });

    // Mapa key -> id das permissões (catálogo global)
    const permissions = await tx.permission.findMany();
    const permIdByKey = new Map(permissions.map((p) => [p.key, p.id]));

    // 2. As 7 roles + suas permissões
    let adminRoleId: string | null = null;

    for (const type of Object.values(RoleType)) {
      const role = await tx.role.create({
        data: { tenantId: tenant.id, type, name: ROLE_LABELS[type] },
      });
      if (type === RoleType.ADMIN) adminRoleId = role.id;

      const rows = permissionsForRole(type).map((key) => {
        const permissionId = permIdByKey.get(key);
        if (!permissionId) {
          throw new Error(
            `Permissão "${key}" (role ${type}) não existe no catálogo. ` +
              `Rode syncPermissions antes do onboarding.`,
          );
        }
        // tenantId DENORMALIZADO aqui, para a política de RLS uniforme.
        return { tenantId: tenant.id, roleId: role.id, permissionId };
      });

      if (rows.length) {
        await tx.rolePermission.createMany({ data: rows, skipDuplicates: true });
      }
    }

    if (!adminRoleId) {
      throw new Error('Role ADMIN não foi criada — verifique o enum RoleType.');
    }

    // 3. Usuário administrador do tenant
    const adminUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: input.admin.email,
        passwordHash: input.admin.passwordHash,
        name: input.admin.name,
        roleId: adminRoleId,
      },
    });

    return { tenant, adminUser };
  });
}
