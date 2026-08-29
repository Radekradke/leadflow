import { createHmac } from 'crypto';
import { WhatsAppWebhookController } from '../whatsapp.webhook.controller';

/**
 * O webhook agora só ENFILEIRA (pgmq) — não processa mais na própria
 * requisição. Isso é o que faz o evento sobreviver a um restart do
 * processo durante uma rajada de campanha (ver queue-worker.spec.ts pro
 * lado do consumo).
 */
const APP_SECRET = 'segredo-de-teste';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('WhatsAppWebhookController', () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  });
  afterAll(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it('assinatura válida: enfileira o payload cru e responde 200', async () => {
    const queue = { send: jest.fn().mockResolvedValue(1) };
    const controller = new WhatsAppWebhookController(queue as any);
    const body = JSON.stringify({ entry: [{ changes: [] }] });
    const req: any = {
      rawBody: Buffer.from(body),
      headers: { 'x-hub-signature-256': sign(body) },
    };
    const res = makeRes();

    await controller.receive(req, res);

    expect(queue.send).toHaveBeenCalledWith('whatsapp_inbound', { entry: [{ changes: [] }] });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('assinatura inválida: NÃO enfileira e responde 401', async () => {
    const queue = { send: jest.fn() };
    const controller = new WhatsAppWebhookController(queue as any);
    const body = JSON.stringify({ entry: [] });
    const req: any = {
      rawBody: Buffer.from(body),
      headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) },
    };
    const res = makeRes();

    await controller.receive(req, res);

    expect(queue.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sem WHATSAPP_APP_SECRET configurado: recusa e não enfileira', async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const queue = { send: jest.fn() };
    const controller = new WhatsAppWebhookController(queue as any);
    const body = JSON.stringify({ entry: [] });
    const req: any = { rawBody: Buffer.from(body), headers: {} };
    const res = makeRes();

    await controller.receive(req, res);

    expect(queue.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('falha ao enfileirar: responde 500 (a Meta deve reentregar, não pode fingir sucesso)', async () => {
    const queue = { send: jest.fn().mockRejectedValue(new Error('banco fora do ar')) };
    const controller = new WhatsAppWebhookController(queue as any);
    const body = JSON.stringify({ entry: [] });
    const req: any = {
      rawBody: Buffer.from(body),
      headers: { 'x-hub-signature-256': sign(body) },
    };
    const res = makeRes();

    await controller.receive(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
