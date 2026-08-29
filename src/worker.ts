import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './common/config/env.validation';
import { QueueWorkerService } from './worker/queue-worker.service';

/**
 * Entrypoint SEM HTTP — só o consumidor de fila. Existe pra quando o
 * volume justificar isolar o processamento do tráfego HTTP (um serviço
 * "Background Worker" à parte no Render, por exemplo): mesmo código do
 * `QueueWorkerService` que roda dentro do `main.ts` no milestone 1, só
 * que como processo próprio. Trocar de um modelo pro outro é config
 * (RUN_QUEUE_WORKER_IN_PROCESS + qual comando de start cada serviço usa),
 * não reescrita.
 */
async function bootstrap() {
  validateEnv();
  const app = await NestFactory.createApplicationContext(AppModule);
  app.get(QueueWorkerService).start();
}

bootstrap();
