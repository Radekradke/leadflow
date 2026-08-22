import { LeadOrigin, LeadStatus, PropertyType } from '@prisma/client';
import { z } from 'zod';

export const createLeadSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório'),
  phone: z.string().trim().min(8, 'Telefone inválido'),
  whatsapp: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').optional(),

  // Sensível — opcional na entrada
  cpf: z.string().trim().optional(),
  familyIncome: z.number().nonnegative().optional(),
  downPaymentAvailable: z.number().nonnegative().optional(),
  hasFGTS: z.boolean().optional(),

  // Interesse
  cityOfInterest: z.string().trim().optional(),
  neighborhoodOfInterest: z.string().trim().optional(),
  enterpriseOfInterest: z.string().trim().optional(),
  propertyType: z.nativeEnum(PropertyType).optional(),

  // Origem
  origin: z.nativeEnum(LeadOrigin),
  sourceDetail: z.string().trim().optional(),
  campaignId: z.string().optional(),

  // Fila de entrada (opcional). Se a fila tiver distribuição automática
  // ligada, o lead é distribuído ao corretor assim que é criado.
  currentQueueId: z.string().optional(),

  notes: z.string().optional(),
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;

// Atualização: todos opcionais; status NÃO entra aqui (mudança de status
// é uma operação própria, com histórico e validação de transição).
export const updateLeadSchema = createLeadSchema.partial();
export type UpdateLeadDto = z.infer<typeof updateLeadSchema>;

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(LeadStatus).optional(),
  search: z.string().trim().optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

// Mudança de status: o motivo é validado no service (obrigatório p/
// LOST/ARCHIVED), porque depende do status de destino.
export const changeStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
  reason: z.string().trim().optional(),
});
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;
