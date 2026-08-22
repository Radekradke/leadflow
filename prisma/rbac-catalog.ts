/**
 * ⚠️ FONTE ÚNICA DE VERDADE: src/common/rbac/permissions.ts
 *
 * Este arquivo existia com uma lista PRÓPRIA de permissões cujas chaves
 * divergiam das que os guards exigem (ex.: 'distribution:assign_manual'
 * vs 'distribution:run_manual'), o que fazia o provision-tenant conceder
 * permissões que NÃO casavam com os @RequirePermissions — resultando em
 * "acesso negado" silencioso.
 *
 * Agora ele apenas RE-EXPORTA o catálogo canônico, derivando o template
 * de roles de permissionsForRole(). Assim existe uma lista só, e o
 * provision-tenant fica idêntico ao onboarding em runtime.
 */
import { RoleType } from '@prisma/client';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  ROLE_LABELS,
  permissionsForRole,
} from '../src/common/rbac/permissions';

export { ALL_PERMISSION_KEYS, PERMISSION_CATALOG, ROLE_LABELS };

/** Template role -> permissões, derivado do catálogo canônico. */
export const ROLE_TEMPLATE: Record<RoleType, string[]> = (
  Object.keys(ROLE_LABELS) as RoleType[]
).reduce(
  (acc, role) => {
    acc[role] = permissionsForRole(role);
    return acc;
  },
  {} as Record<RoleType, string[]>,
);
