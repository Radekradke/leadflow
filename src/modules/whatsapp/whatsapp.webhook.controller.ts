import { Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { SkipCsrf } from '../../common/auth/csrf.guard';
import { PgmqService } from '../../common/queue/pgmq.service';
import { verifySignature } from './whatsapp.signature';

/**
 * Webhook da Meta (app ÚNICO do SaaS). Público e isento de CSRF — quem
 * chama é a Meta, não o navegador. A autenticidade vem de DOIS lugares:
 *   - GET  : token de verificação (WHATSAPP_WEBHOOK_VERIFY_TOKEN).
 *   - POST : assinatura HMAC do corpo cru (WHATSAPP_APP_SECRET).
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly queue: PgmqService) {}

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

    // Log de diagnóstico: sem isto, uma recusa aqui é invisível — a Meta
    // só mostra "falhou" do lado dela e o motivo real fica escondido.
    if (!appSecret) {
      this.logger.error(
        'Evento recebido, mas WHATSAPP_APP_SECRET não está definida no ambiente — recusado.',
      );
      return res.status(401).send('invalid signature');
    }
    if (!sig) {
      this.logger.warn(
        'Evento recebido sem o cabeçalho x-hub-signature-256 — recusado.',
      );
      return res.status(401).send('invalid signature');
    }
    if (!verifySignature(req.rawBody, sig, appSecret)) {
      this.logger.warn(
        'Assinatura inválida — o WHATSAPP_APP_SECRET do servidor não confere com o App Secret da Meta.',
      );
      return res.status(401).send('invalid signature');
    }
    this.logger.log('Evento do WhatsApp recebido e assinatura validada.');
    // Só GRAVA na fila (pgmq) e responde — não processa mais aqui. Isso é
    // o que sobrevive a um restart do processo no meio de uma rajada de
    // campanha: o evento fica persistido no Postgres até um worker
    // consumir, em vez de morrer com o processo Node. O processamento em
    // si (WhatsAppInboundService.handleEvent) roda no worker (ver
    // src/worker/queue-worker.service.ts), sem nenhuma mudança na lógica.
    try {
      const payload = JSON.parse((req.rawBody as Buffer).toString('utf8'));
      await this.queue.send('whatsapp_inbound', payload);
      res.status(200).send('ok');
    } catch (err) {
      // Não conseguimos nem enfileirar: melhor a Meta reentregar do que
      // fingir sucesso e perder o evento de vez.
      this.logger.error(`Falha ao enfileirar evento do WhatsApp: ${String(err)}`);
      res.status(500).send('failed to enqueue');
    }
  }
}
