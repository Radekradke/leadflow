import { z } from 'zod';

// Transferir para um corretor específico.
export const transferToBrokerSchema = z.object({
  toBrokerProfileId: z.string().min(1, 'Corretor de destino obrigatório'),
  reason: z.string().trim().min(1, 'Motivo é obrigatório'),
});
export type TransferToBrokerDto = z.infer<typeof transferToBrokerSchema>;

// Devolver o lead para uma fila (volta ao pool de distribuição).
export const transferToQueueSchema = z.object({
  toQueueId: z.string().min(1, 'Fila de destino obrigatória'),
  reason: z.string().trim().min(1, 'Motivo é obrigatório'),
});
export type TransferToQueueDto = z.infer<typeof transferToQueueSchema>;

// Redistribuir TODA a carteira ativa de um corretor (saída/desligamento).
export const redistributeSchema = z.object({
  toQueueId: z.string().optional(), // ausente = mantém a fila atual de cada lead
  reason: z.string().trim().min(1, 'Motivo é obrigatório'),
  autoDistribute: z.boolean().optional(), // true = já redistribui via motor
});
export type RedistributeDto = z.infer<typeof redistributeSchema>;
