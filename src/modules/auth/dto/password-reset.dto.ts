import { z } from 'zod';

/**
 * Política de senha — ponto ÚNICO de verdade. Reaproveite este schema
 * em qualquer lugar que crie/troque senha (reset, criação de usuário,
 * troca pelo próprio usuário) para a regra nunca divergir.
 *
 * Piso atual: 8+ caracteres, com ao menos uma letra e um número. Suba
 * a régua conforme a necessidade (símbolo obrigatório, 12+ etc.).
 */
export const passwordPolicy = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .max(128, 'Máximo de 128 caracteres')
  .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
  .regex(/[0-9]/, 'Inclua ao menos um número');

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
});
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token obrigatório'),
  password: passwordPolicy,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
