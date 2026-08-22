import { DistributionStrategy } from '@prisma/client';
import { z } from 'zod';

// Distribuir um lead. queueId é opcional: se ausente, usa a fila atual do lead.
export const distributeLeadSchema = z.object({
  queueId: z.string().optional(),
});
export type DistributeLeadDto = z.infer<typeof distributeLeadSchema>;

// Config da fila. Pelo menos um dos campos precisa vir.
export const queueConfigSchema = z
  .object({
    strategy: z.nativeEnum(DistributionStrategy).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((d) => d.strategy !== undefined || d.enabled !== undefined, {
    message: 'Informe strategy e/ou enabled',
  });
export type QueueConfigDto = z.infer<typeof queueConfigSchema>;
