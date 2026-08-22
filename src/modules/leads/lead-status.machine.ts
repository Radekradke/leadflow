import { LeadStatus } from '@prisma/client';

/**
 * Transições permitidas (de -> para) na MUDANÇA MANUAL de status.
 * Impede saltos sem sentido (ex.: RESOLVED -> NEW). Status do sistema
 * (AWAITING_DISTRIBUTION, DISTRIBUTED, TO_REDISTRIBUTE) também são
 * alcançáveis/sairáveis aqui no que faz sentido para um humano; o motor
 * de distribuição (Sprint 3) cuidará dos seus próprios movimentos.
 */
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['IN_SERVICE', 'IN_QUALIFICATION', 'NO_RESPONSE', 'LOST', 'ARCHIVED'],
  AWAITING_DISTRIBUTION: ['IN_SERVICE', 'LOST', 'ARCHIVED'],
  DISTRIBUTED: ['IN_SERVICE', 'NO_RESPONSE', 'LOST', 'ARCHIVED'],
  IN_SERVICE: [
    'IN_QUALIFICATION', 'NO_RESPONSE', 'VISIT_SUGGESTED', 'VISIT_SCHEDULED',
    'FUTURE_PROPOSAL', 'RESOLVED', 'LOST', 'TO_REDISTRIBUTE', 'ARCHIVED',
  ],
  NO_RESPONSE: ['IN_SERVICE', 'IN_QUALIFICATION', 'LOST', 'TO_REDISTRIBUTE', 'ARCHIVED'],
  IN_QUALIFICATION: [
    'IN_SERVICE', 'VISIT_SUGGESTED', 'VISIT_SCHEDULED', 'FUTURE_PROPOSAL',
    'NO_RESPONSE', 'RESOLVED', 'LOST', 'ARCHIVED',
  ],
  VISIT_SUGGESTED: [
    'VISIT_SCHEDULED', 'IN_QUALIFICATION', 'NO_RESPONSE', 'FUTURE_PROPOSAL',
    'RESOLVED', 'LOST', 'ARCHIVED',
  ],
  VISIT_SCHEDULED: [
    'FUTURE_PROPOSAL', 'IN_QUALIFICATION', 'NO_RESPONSE', 'RESOLVED', 'LOST', 'ARCHIVED',
  ],
  FUTURE_PROPOSAL: ['RESOLVED', 'IN_QUALIFICATION', 'NO_RESPONSE', 'LOST', 'ARCHIVED'],
  RESOLVED: ['ARCHIVED'],
  LOST: ['IN_SERVICE', 'ARCHIVED'], // reativar ou arquivar
  TO_REDISTRIBUTE: ['IN_SERVICE', 'LOST', 'ARCHIVED'],
  ARCHIVED: [], // terminal
};

/** Status que EXIGEM motivo (alimentam o relatório de motivos de perda). */
const REASON_REQUIRED: LeadStatus[] = ['LOST', 'ARCHIVED'];

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function reasonRequired(to: LeadStatus): boolean {
  return REASON_REQUIRED.includes(to);
}

export function allowedTransitions(from: LeadStatus): LeadStatus[] {
  return TRANSITIONS[from] ?? [];
}
