import { BrokerAvailability } from '@prisma/client';
import { z } from 'zod';

export const setAvailabilitySchema = z.object({
  availability: z.nativeEnum(BrokerAvailability),
});
export type SetAvailabilityDto = z.infer<typeof setAvailabilitySchema>;

export const updateBrokerSchema = z.object({
  maxActiveLeads: z.number().int().min(0).optional(),
  acceptsDistribution: z.boolean().optional(),
});
export type UpdateBrokerDto = z.infer<typeof updateBrokerSchema>;
