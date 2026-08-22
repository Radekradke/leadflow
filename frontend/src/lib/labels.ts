export const INTERACTION_TYPES: Record<string, string> = {
  CALL: 'Ligação', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', NOTE: 'Anotação', MEETING: 'Reunião',
};
export const OUTCOMES: Record<string, string> = {
  ANSWERED: 'Atendeu', NO_ANSWER: 'Não atendeu', BUSY: 'Ocupado',
  INVALID_CONTACT: 'Contato inválido', SCHEDULED: 'Agendou',
};
export const AVAILABILITY: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Disponível', color: '#16b88a' },
  BUSY: { label: 'Ocupado', color: '#f59e0b' },
  AWAY: { label: 'Ausente', color: '#94a3b8' },
  OFFLINE: { label: 'Offline', color: '#cbd5e1' },
};
export const STRATEGIES: Record<string, string> = {
  ROUND_ROBIN: 'Revezamento', LEAST_LOADED: 'Menos carga', RANDOM: 'Aleatório',
};
export const DIST_RESULT: Record<string, string> = {
  ASSIGNED: 'Atribuído', NO_BROKER_AVAILABLE: 'Sem corretor', NO_QUEUE: 'Sem fila',
  QUEUE_INACTIVE: 'Fila inativa', ALREADY_ASSIGNED: 'Já atribuído',
};
