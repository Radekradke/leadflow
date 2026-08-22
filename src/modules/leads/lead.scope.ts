import { Prisma, RoleType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Escopo de LEITURA de leads por perfil. A RLS já limita ao tenant; isto
 * limita DENTRO do tenant — é a camada de "ownership" que impede um
 * corretor de ver o lead de outro (a falha de IDOR mais comum em CRM).
 *
 *  - BROKER       -> só leads cuja atribuição ATIVA (endedAt = null) é dele.
 *  - COORDINATOR  -> leads da sua equipe (corretor da mesma teamId).
 *  - ADMIN, SALES_MANAGER, ATTENDANT, QUEUE_SUPERVISOR, VIEWER
 *                 -> tenant inteiro (já limitado pela RLS).
 *
 * Nota: o recorte "Gestor vê só o departamento" é uma evolução futura;
 * no MVP o gestor vê o tenant todo. BROKER e COORDINATOR são os recortes
 * que realmente importam para privacidade no dia a dia.
 */
export function leadScopeWhere(user: AuthenticatedUser): Prisma.LeadWhereInput {
  switch (user.roleType) {
    case RoleType.BROKER:
      return {
        assignments: {
          some: { endedAt: null, brokerProfile: { userId: user.id } },
        },
      };

    case RoleType.COORDINATOR:
      if (!user.teamId) {
        // Coordenador sem equipe não enxerga nada (fail-safe, não fail-open).
        return { id: '__no_team__' };
      }
      return {
        assignments: {
          some: {
            endedAt: null,
            brokerProfile: { user: { teamId: user.teamId } },
          },
        },
      };

    default:
      return {};
  }
}
