import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { SkipCsrf } from '../../common/auth/csrf.guard';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { verifySignature } from './whatsapp.signature';

/**
 * Webhook da Meta (app ÚNICO do SaaS). Público e isento de CSRF — quem
 * chama é a Meta, não o navegador. A autenticidade vem de DOIS lugares:
 *   - GET  : token de verificação (WHATSAPP_WEBHOOK_VERIFY_TOKEN).
 *   - POST : assinatura HMAC do corpo cru (WHATSAPP_APP_SECRET).
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(private readonly inbound: WhatsAppInboundService) {}

  /** Verificação inicial: a Meta manda um desafio que devolvemos. */
  @Public()
  @SkipCsrf()
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('forbidden');
  }

  /** Recebimento de eventos (mensagens + status). */
  @Public()
  @SkipCsrf()
  @Post()
  async receive(@Req() req: any, @Res() res: Response) {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!appSecret || !verifySignature(req.rawBody, sig, appSecret)) {
      return res.status(401).send('invalid signature');
    }
    // Responde rápido (a Meta espera 200 em poucos segundos) e processa depois.
    res.status(200).send('ok');
    try {
      const payload = JSON.parse((req.rawBody as Buffer).toString('utf8'));
      await this.inbound.handleEvent(payload);
    } catch {
      // Já respondemos 200; falhas são logadas no serviço de ingestão.
    }
  }
}
