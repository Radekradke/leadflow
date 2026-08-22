import { z } from 'zod';

export const loginSchema = z.object({
  // normaliza para minúsculas: o e-mail é gravado e buscado sempre
  // em minúsculas, para um "Joao@x.com" no login achar "joao@x.com".
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export type LoginDto = z.infer<typeof loginSchema>;
