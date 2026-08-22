import { z } from 'zod';

export const createQueueSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório'),
  isActive: z.boolean().optional(),
  // Cadeia de distribuição: fila-pai (ex.: o "Regional") e o peso desta
  // fila dentro dele (percentual). Sem parentId, é uma fila raiz.
  parentId: z.string().min(1).nullable().optional(),
  routingWeight: z.number().int().min(0).max(100).optional(),
});
export type CreateQueueDto = z.infer<typeof createQueueSchema>;

export const updateQueueSchema = z.object({
  name: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().min(1).nullable().optional(),
  routingWeight: z.number().int().min(0).max(100).optional(),
  distributionEnabled: z.boolean().optional(),
});
export type UpdateQueueDto = z.infer<typeof updateQueueSchema>;

export const addMemberSchema = z.object({
  brokerProfileId: z.string().min(1),
});
export type AddMemberDto = z.infer<typeof addMemberSchema>;

/** Mapear um anúncio da Meta para uma fila. */
export const upsertAdRouteSchema = z.object({
  adSourceId: z.string().trim().min(1, 'ID do anúncio obrigatório').max(120),
  queueId: z.string().trim().min(1, 'Fila obrigatória'),
  label: z.string().trim().max(120).optional(),
});
export type UpsertAdRouteDto = z.infer<typeof upsertAdRouteSchema>;
