import { Module } from '@nestjs/common';
import { QueueModule } from '../../common/queue/queue.module';
import { DistributionModule } from '../distribution/distribution.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';

@Module({
  // DistributionModule exporta o DistributionService: é ele que distribui
  // o lead assim que a mensagem chega pelo webhook (dentro do worker, agora).
  // QueueModule: o controller do webhook só grava na fila, não processa mais.
  imports: [DistributionModule, QueueModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, WhatsAppInboundService],
  // Exportado para o WorkerModule injetar e consumir a fila.
  exports: [WhatsAppInboundService],
})
export class WhatsAppModule {}
