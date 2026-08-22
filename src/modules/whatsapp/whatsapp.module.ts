import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';

@Module({
  // DistributionModule exporta o DistributionService: é ele que distribui
  // o lead assim que a mensagem chega pelo webhook.
  imports: [DistributionModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, WhatsAppInboundService],
})
export class WhatsAppModule {}
