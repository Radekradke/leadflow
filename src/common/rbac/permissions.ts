import { RoleType } from '@prisma/client';

export type PermissionDef = { key: string; description: string };

/**
 * Catálogo GLOBAL de ações — o vocabulário fixo do RBAC.
 * Cada item vira uma linha na tabela Permission (sem tenantId: é
 * compartilhado por todos os tenants). Isto é "O QUE pode ser feito".
 * "QUAIS linhas o usuário enxerga" (escopo) é tratado nas queries dos
 * services, a partir do TIPO da role — NÃO aqui.
 */
export const PERMISSION_CATALOG: PermissionDef[] = [
  // Usuários
  { key: 'user:read', description: 'Ver usuários do tenant' },
  { key: 'user:create', description: 'Criar usuários' },
  { key: 'user:update', description: 'Editar usuários' },
  { key: 'user:deactivate', description: 'Ativar/desativar usuários' },
  // Organização
  { key: 'team:read', description: 'Ver equipes e departamentos' },
  { key: 'team:manage', description: 'Criar/editar equipes e departamentos' },
  { key: 'queue:read', description: 'Ver filas' },
  { key: 'queue:manage', description: 'Criar/editar filas e seus membros' },
  // Leads
  { key: 'lead:read', description: 'Ver leads (dentro do escopo do perfil)' },
  { key: 'lead:read_sensitive', description: 'Ver dados sensíveis completos do lead (CPF/renda)' },
  { key: 'lead:read_contact', description: 'Ver telefone/WhatsApp do lead sem máscara' },
  { key: 'lead:create', description: 'Cadastrar leads' },
  { key: 'lead:update', description: 'Editar leads e mudar status' },
  { key: 'lead:transfer', description: 'Transferir leads entre corretores/filas' },
  { key: 'lead:archive', description: 'Arquivar ou marcar leads como perdidos' },
  // Distribuição
  { key: 'distribution:configure', description: 'Configurar regras de distribuição' },
  { key: 'distribution:run_manual', description: 'Distribuir leads manualmente' },
  // Atendimento
  { key: 'interaction:create', description: 'Registrar interações/tentativas de contato' },
  { key: 'task:read', description: 'Ver tarefas' },
  { key: 'task:manage', description: 'Criar/editar/concluir tarefas' },
  // Dashboards
  { key: 'dashboard:operational', description: 'Acessar painel operacional (corretor)' },
  { key: 'dashboard:management', description: 'Acessar painel gerencial' },
  // Auditoria
  { key: 'audit:read', description: 'Consultar logs de auditoria' },
  // WhatsApp
  { key: 'whatsapp:configure', description: 'Configurar a conta WhatsApp do tenant' },
  { key: 'whatsapp:read', description: 'Ver conversas e mensagens do WhatsApp' },
  { key: 'whatsapp:send', description: 'Enviar mensagens pelo WhatsApp' },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

/** Rótulos exibíveis das roles (campo Role.name). */
export const ROLE_LABELS: Record<RoleType, string> = {
  ADMIN: 'Administrador',
  SALES_MANAGER: 'Gestor Comercial',
  COORDINATOR: 'Coordenador',
  BROKER: 'Corretor',
  ATTENDANT: 'Atendimento',
  QUEUE_SUPERVISOR: 'Supervisor de Fila',
  VIEWER: 'Visualizador',
};

/**
 * Template de permissões por perfil. ADMIN não aparece aqui: ele é
 * resolvido para TODAS as permissões (ver permissionsForRole).
 * Este é o ponto onde você ajusta "quem pode o quê" no MVP.
 */
const ROLE_TEMPLATES: Record<Exclude<RoleType, 'ADMIN'>, string[]> = {
  SALES_MANAGER: [
    'user:read', 'team:read', 'team:manage', 'queue:read', 'queue:manage',
    'lead:read', 'lead:read_sensitive', 'lead:read_contact', 'lead:create', 'lead:update', 'lead:transfer', 'lead:archive',
    'distribution:configure', 'distribution:run_manual',
    'interaction:create', 'task:read', 'task:manage',
    'whatsapp:configure', 'whatsapp:read', 'whatsapp:send',
    'dashboard:operational', 'dashboard:management', 'audit:read',
  ],
  COORDINATOR: [
    'user:read', 'queue:read',
    'lead:read', 'lead:read_sensitive', 'lead:read_contact', 'lead:create', 'lead:update', 'lead:transfer', 'lead:archive',
    'distribution:run_manual',
    'interaction:create', 'task:read', 'task:manage',
    'whatsapp:read', 'whatsapp:send',
    'dashboard:operational', 'dashboard:management',
  ],
  QUEUE_SUPERVISOR: [
    'queue:read', 'queue:manage',
    'distribution:configure', 'distribution:run_manual',
    'lead:read', 'lead:read_contact', 'lead:transfer',
    'interaction:create', 'task:read',
    'dashboard:operational', 'dashboard:management',
  ],
  // CORRETOR: vê CPF (simulação) mas NÃO o telefone cru. Usa o inbox do
  // WhatsApp (atende pelo sistema) — por isso whatsapp:read/send.
  BROKER: [
    'lead:read', 'lead:read_sensitive', 'lead:create', 'lead:update', 'lead:transfer', 'lead:archive',
    'interaction:create', 'task:read', 'task:manage',
    'whatsapp:read', 'whatsapp:send',
    'dashboard:operational',
  ],
  ATTENDANT: [
    'lead:read', 'lead:read_sensitive', 'lead:read_contact', 'lead:create', 'lead:update',
    'distribution:run_manual',
    'interaction:create', 'task:read',
    'whatsapp:read', 'whatsapp:send',
    'dashboard:operational',
  ],
  VIEWER: [
    'lead:read', 'queue:read', 'team:read', 'task:read',
    'dashboard:operational',
  ],
};

/** Permissões de uma role. ADMIN recebe tudo. */
export function permissionsForRole(type: RoleType): string[] {
  if (type === 'ADMIN') return [...ALL_PERMISSION_KEYS];
  return ROLE_TEMPLATES[type];
}
