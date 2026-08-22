import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateTaskDto,
  ListTasksQuery,
  createTaskSchema,
  listTasksQuerySchema,
} from './dto/task.dto';
import { TaskService } from './task.service';

@Controller('tasks')
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Post()
  @RequirePermissions('task:manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
  ) {
    return this.tasks.create(user, dto);
  }

  @Get()
  @RequirePermissions('task:read')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ) {
    return this.tasks.listMine(user, query);
  }

  // Concluir exige só task:read; o service garante que é a SUA tarefa
  // (ou que você tem task:manage).
  @Patch(':id/complete')
  @RequirePermissions('task:read')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tasks.complete(user, id);
  }
}
