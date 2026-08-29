import { Module } from '@nestjs/common';
import { QueueModule } from '../common/queue/queue.module';
import { WhatsAppModule } from '../modules/whatsapp/whatsapp.module';
import { QueueWorkerService } from './queue-worker.service';

/**
 * Módulo do consumidor de fila. Fica à parte do resto da AppModule por
 * clareza (é infraestrutura, não uma feature de negócio), mas reaproveita
 * o WhatsAppModule inteiro — mesma injeção de dependência, mesmos serviços,
 * zero duplicação de lógica.
 *
 * QueueModule precisa ser importado AQUI TAMBÉM: o WhatsAppModule importa
 * QueueModule pra uso interno (o webhook enfileira), mas não re-exporta
 * PgmqService — módulo do Nest não propaga export de forma transitiva.
 */
@Module({
  imports: [WhatsAppModule, QueueModule],
  providers: [QueueWorkerService],
  exports: [QueueWorkerService],
})
export class WorkerModule {}
