// Espelha os enums/contratos do backend no que o front precisa.

export type RoleType =
  | 'ADMIN'
  | 'SALES_MANAGER'
  | 'COORDINATOR'
  | 'BROKER'
  | 'ATTENDANT'
  | 'QUEUE_SUPERVISOR'
  | 'VIEWER';

export type LeadStatus =
  | 'NEW'
  | 'AWAITING_DISTRIBUTION'
  | 'DISTRIBUTED'
  | 'IN_SERVICE'
  | 'NO_RESPONSE'
  | 'IN_QUALIFICATION'
  | 'VISIT_SUGGESTED'
  | 'VISIT_SCHEDULED'
  | 'FUTURE_PROPOSAL'
  | 'RESOLVED'
  | 'LOST'
  | 'TO_REDISTRIBUTE'
  | 'ARCHIVED';

export interface CurrentUser {
  id: string;
  tenantId: string;
  roleType: RoleType;
  permissions: string[];
  name?: string;
  email?: string;
}

// Rótulo em PT + classes de cor (texto/fundo) para a pílula de status.
export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  NEW: { label: 'Novo', className: 'bg-slate-100 text-slate-600' },
  AWAITING_DISTRIBUTION: { label: 'Aguardando', className: 'bg-amber-50 text-amber-700' },
  DISTRIBUTED: { label: 'Distribuído', className: 'bg-blue-50 text-blue-700' },
  IN_SERVICE: { label: 'Em atendimento', className: 'bg-blue-50 text-blue-700' },
  NO_RESPONSE: { label: 'Sem resposta', className: 'bg-amber-50 text-amber-700' },
  IN_QUALIFICATION: { label: 'Em qualificação', className: 'bg-indigo-50 text-indigo-700' },
  VISIT_SUGGESTED: { label: 'Visita sugerida', className: 'bg-violet-50 text-violet-700' },
  VISIT_SCHEDULED: { label: 'Visita agendada', className: 'bg-violet-50 text-violet-700' },
  FUTURE_PROPOSAL: { label: 'Proposta futura', className: 'bg-teal-50 text-teal-700' },
  RESOLVED: { label: 'Convertido', className: 'bg-accent-50 text-accent-700' },
  LOST: { label: 'Perdido', className: 'bg-red-50 text-red-700' },
  TO_REDISTRIBUTE: { label: 'Redistribuir', className: 'bg-orange-50 text-orange-700' },
  ARCHIVED: { label: 'Arquivado', className: 'bg-slate-100 text-slate-400' },
};

export const ROLE_LABELS: Record<RoleType, string> = {
  ADMIN: 'Administrador',
  SALES_MANAGER: 'Gestor comercial',
  COORDINATOR: 'Coordenador',
  BROKER: 'Corretor',
  ATTENDANT: 'Atendimento',
  QUEUE_SUPERVISOR: 'Supervisor de fila',
  VIEWER: 'Visualizador',
};

// ── Entidades de domínio (campos que o front usa) ──
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  cpf: string | null; // já mascarado pelo backend conforme permissão
  familyIncome: string | null;
  downPaymentAvailable: string | null;
  hasFGTS?: boolean | null;
  cityOfInterest?: string | null;
  neighborhoodOfInterest?: string | null;
  enterpriseOfInterest?: string | null;
  origin: string;
  sourceDetail?: string | null;
  status: LeadStatus;
  currentQueueId: string | null;
  lastContactAt: string | null;
  nextActionAt: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Interaction {
  id: string;
  type: string;
  outcome?: string | null;
  content?: string | null;
  createdAt: string;
}

export interface Queue {
  id: string;
  name: string;
  isActive: boolean;
  distributionStrategy: 'ROUND_ROBIN' | 'LEAST_LOADED' | 'RANDOM';
  distributionEnabled: boolean;
  createdAt: string;
  // Cadeia de distribuição (regional → gerentes → corretores)
  parentId: string | null;
  routingWeight: number;
  routedCount: number;
}

export interface BrokerProfile {
  id: string;
  availability: 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE';
  maxActiveLeads: number;
  acceptsDistribution: boolean;
  user: { id: string; name: string; email: string; isActive?: boolean };
}

export interface QueueMember {
  queueId: string;
  brokerProfileId: string;
  brokerProfile: BrokerProfile;
}

export interface DistributionLog {
  id: string;
  leadId: string;
  queueId: string | null;
  strategy: string | null;
  result: string;
  brokerProfileId: string | null;
  candidateCount: number;
  message: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  teamId: string | null;
  createdAt: string;
  role: { type: RoleType; name: string };
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  department?: { id: string; name: string };
  _count?: { members: number };
}

export interface Department {
  id: string;
  name: string;
  _count?: { teams: number };
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueAt: string | null;
  leadId: string | null;
  status: 'PENDING' | 'DONE' | 'CANCELED';
  completedAt: string | null;
  createdAt: string;
}

export interface AdRoute {
  id: string;
  adSourceId: string;
  label: string | null;
  queueId: string;
  queue?: { id: string; name: string };
}

export interface AdRoute {
  id: string;
  adSourceId: string;
  label: string | null;
  queueId: string;
  queue?: { id: string; name: string };
}
