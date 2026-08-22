import { AuthenticatedUser } from '../../modules/auth/auth.types';

/**
 * Eventos internos da aplicação. Usar constantes (não strings soltas) evita
 * erro de digitação entre quem emite e quem escuta.
 */
export const LEAD_CREATED = 'lead.created';

export interface LeadCreatedEvent {
  leadId: string;
  actor: AuthenticatedUser; // carrega tenantId/id p/ escrever as linhas
}
