import { QueueWorkerService } from '../queue-worker.service';

/**
 * Garante o contrato do worker: sucesso confirma (ack) e some da fila;
 * falha NÃO confirma — a mensagem some da visibilidade e volta sozinha
 * depois do timeout (retry "de graça" do pgmq, sem DLQ customizado aqui).
 */
function makeQueue(messages: any[]) {
  return {
    read: jest.fn().mockResolvedValue(messages),
    ack: jest.fn().mockResolvedValue(undefined),
    logFailure: jest.fn(),
  };
}

describe('QueueWorkerService', () => {
  it('processa cada mensagem lida e confirma (ack) no sucesso', async () => {
    const queue = makeQueue([
      { msgId: 1, readCt: 1, enqueuedAt: new Date(), message: { a: 1 } },
      { msgId: 2, readCt: 1, enqueuedAt: new Date(), message: { a: 2 } },
    ]);
    const inbound = { handleEvent: jest.fn().mockResolvedValue(undefined) };
    const worker = new QueueWorkerService(queue as any, inbound as any);

    await (worker as any).pollOnce();

    expect(inbound.handleEvent).toHaveBeenCalledTimes(2);
    expect(inbound.handleEvent).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(inbound.handleEvent).toHaveBeenNthCalledWith(2, { a: 2 });
    expect(queue.ack).toHaveBeenCalledWith('whatsapp_inbound', 1);
    expect(queue.ack).toHaveBeenCalledWith('whatsapp_inbound', 2);
  });

  it('quando o processamento falha, NÃO confirma (mensagem volta pra fila)', async () => {
    const queue = makeQueue([
      { msgId: 7, readCt: 1, enqueuedAt: new Date(), message: { boom: true } },
    ]);
    const inbound = {
      handleEvent: jest.fn().mockRejectedValue(new Error('falha ao processar')),
    };
    const worker = new QueueWorkerService(queue as any, inbound as any);

    await (worker as any).pollOnce();

    expect(queue.ack).not.toHaveBeenCalled();
    expect(queue.logFailure).toHaveBeenCalledWith(
      'whatsapp_inbound',
      7,
      expect.any(Error),
    );
  });

  it('fila vazia: não faz nada, não quebra', async () => {
    const queue = makeQueue([]);
    const inbound = { handleEvent: jest.fn() };
    const worker = new QueueWorkerService(queue as any, inbound as any);

    await expect((worker as any).pollOnce()).resolves.toBeUndefined();
    expect(inbound.handleEvent).not.toHaveBeenCalled();
  });

  it('não sobrepõe execuções: um poll em andamento ignora o próximo tick', async () => {
    let resolveFirst!: () => void;
    const stillRunning = new Promise<void>((resolve) => (resolveFirst = resolve));
    const queue = makeQueue([
      { msgId: 1, readCt: 1, enqueuedAt: new Date(), message: {} },
    ]);
    const inbound = {
      handleEvent: jest.fn().mockImplementation(() => stillRunning),
    };
    const worker = new QueueWorkerService(queue as any, inbound as any);

    const first = (worker as any).pollOnce();
    const second = (worker as any).pollOnce(); // dispara "em cima" do primeiro

    resolveFirst();
    await Promise.all([first, second]);

    // read só foi chamado uma vez: o segundo poll saiu de imediato (guard).
    expect(queue.read).toHaveBeenCalledTimes(1);
  });
});
