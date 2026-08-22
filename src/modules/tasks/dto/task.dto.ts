import { TaskStatus } from '@prisma/client';
import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Título obrigatório'),
  description: z.string().trim().optional(),
  dueAt: z.coerce.date().optional(),
  leadId: z.string().optional(), // tarefa pode ou não estar ligada a um lead
  assignedToUserId: z.string().optional(), // default: o próprio criador
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const listTasksQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
