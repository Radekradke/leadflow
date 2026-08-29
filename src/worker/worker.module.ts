import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../modules/whatsapp/whatsapp.module';
import { QueueWorkerService } from './queue-worker.service';

/**
 * Módulo do consumidor de fila. Fica à parte do resto da AppModule por
 * clareza (é infraestrutura, não uma feature de negócio), mas reaproveita
 * o WhatsAppModule inteiro — mesma injeção de dependência, mesmos serviços,
 * zero duplicação de lógica.
 */
@Module({
  imports: [WhatsAppModule],
  providers: [QueueWorkerService],
  exports: [QueueWorkerService],
})
export class WorkerModule {}
