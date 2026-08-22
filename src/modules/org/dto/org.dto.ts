import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório'),
});
export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).optional(),
});
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório'),
  departmentId: z.string().min(1, 'Departamento obrigatório'),
});
export type CreateTeamDto = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).optional(),
  departmentId: z.string().min(1).optional(),
});
export type UpdateTeamDto = z.infer<typeof updateTeamSchema>;

export const listTeamsQuerySchema = z.object({
  departmentId: z.string().optional(),
});
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;
