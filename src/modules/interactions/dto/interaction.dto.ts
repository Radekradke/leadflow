import { InteractionOutcome, InteractionType } from '@prisma/client';
import { z } from 'zod';

export const createInteractionSchema = z.object({
  type: z.nativeEnum(InteractionType),
  outcome: z.nativeEnum(InteractionOutcome).optional(),
  content: z.string().trim().optional(),
});
export type CreateInteractionDto = z.infer<typeof createInteractionSchema>;
