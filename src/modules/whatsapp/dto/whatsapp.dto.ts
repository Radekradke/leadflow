import { z } from 'zod';

/** Credenciais do WhatsApp Business (admin do tenant configura). */
export const setAccountSchema = z.object({
  phoneNumberId: z.string().trim().min(1, 'phoneNumberId obrigatório'),
  accessToken: z.string().trim().min(10, 'accessToken inválido'),
  verifyToken: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  wabaId: z.string().trim().optional(),
  displayNumber: z.string().trim().optional(),
  // Fila em que os leads do WhatsApp entram (vazio = escolha automática).
  defaultQueueId: z.string().trim().optional(),
});
export type SetAccountDto = z.infer<typeof setAccountSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mensagem vazia').max(4096, 'Mensagem muito longa'),
});
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

/** Simulação de lead recebido (modo dev). */
export const simulateInboundSchema = z.object({
  from: z.string().trim().min(8, 'Telefone inválido').max(20),
  name: z.string().trim().max(120).optional(),
  text: z.string().trim().min(1, 'Mensagem vazia').max(2000),
  adHeadline: z.string().trim().max(200).optional(),
  adSourceId: z.string().trim().max(120).optional(),
});
export type SimulateInboundDto = z.infer<typeof simulateInboundSchema>;
