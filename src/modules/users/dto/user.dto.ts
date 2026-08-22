import { RoleType } from '@prisma/client';
import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo de 8 caracteres'),
  roleType: z.nativeEnum(RoleType),
  teamId: z.string().optional(),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  roleType: z.nativeEnum(RoleType).optional(),
  teamId: z.string().nullable().optional(), // null = remover da equipe
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const setActiveSchema = z.object({ isActive: z.boolean() });
export type SetActiveDto = z.infer<typeof setActiveSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  roleType: z.nativeEnum(RoleType).optional(),
  search: z.string().trim().optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
