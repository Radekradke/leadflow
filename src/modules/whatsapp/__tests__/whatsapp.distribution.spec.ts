import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { WhatsAppInboundService } from '../whatsapp.inbound.service';

/**
 * Garante o requisito central: mensagem chegou → lead criado → lead
 * DISTRIBUÍDO. Exercita o caminho real (o mesmo do webhook), com o banco e o
 * motor de distribuição mockados.
 */

function makePlatform(overrides: Record<string, any> = {}) {
  return {
    message: {
      findUnique: jest.fn().mockResolvedValue(null), // não é reentrega
      create: jest.fn().mockResolvedValue({ id: 'msg1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    lead: {
      findFirst: jest.fn().mockResolvedValue(null), // número desconhecido
      create: jest.fn().mockResolvedValue({ id: 'lead1', name: 'Contato' }),
      update: jest.fn().mockResolvedValue({}),
    },
    conversation: {
      upsert: jest.fn().mockResolvedValue({ id: 'conv1' }),
    },
    whatsAppAccount: {
      findUnique: jest.fn().mockResolvedValue({ defaultQueueId: null }),
    },
    queue: {
      // Por padrão: existe uma fila ativa com distribuição ligada.
      findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
        where?.distributionEnabled ? { id: 'fila-ativa' } : { id: 'fila-ativa' },
      ),
    },
    ...overrides,
  } as any;
}

function makeService(platform: any, distribution: any) {
  const tenantContext = new TenantContextService(); // real: prova a propagação
  const service = new WhatsAppInboundService(platform, tenantContext, distribution);
  return { service, tenantContext };
}

const MSG = { from: '5521999990045', name: 'Ana', text: 'Tenho interesse' };

describe('WhatsApp → distribuição automática', () => {
  it('lead NOVO: coloca na fila e distribui', async () => {
    const platform = makePlatform();
    const distribution = { autoDistribute: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeService(platform, distribution);

    await service.simulateInbound('tenant-1', MSG);

    // entrou na fila antes de distribuir
    expect(platform.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentQueueId: 'fila-ativa' } }),
    );
    // e o motor foi acionado para esse lead
    expect(distribution.autoDistribute).toHaveBeenCalledTimes(1);
    const [actor, leadId] = distribution.autoDistribute.mock.calls[0];
    expect(leadId).toBe('lead1');
    expect(actor).toEqual({ id: null, tenantId: 'tenant-1', system: true });
  });

  it('lead JÁ EXISTENTE: não redistribui (não rouba o atendimento)', async () => {
    const platform = makePlatform();
    platform.lead.findFirst.mockResolvedValue({ id: 'lead-antigo', name: 'Ana' });
    const distribution = { autoDistribute: jest.fn() };
    const { service } = makeService(platform, distribution);

    await service.simulateInbound('tenant-1', MSG);

    expect(platform.lead.create).not.toHaveBeenCalled();
    expect(distribution.autoDistribute).not.toHaveBeenCalled();
  });

  it('a distribuição roda COM o tenant no contexto (senão a RLS bloquearia)', async () => {
    const platform = makePlatform();
    let tenantVisto: string | undefined;
    const distribution = { autoDistribute: jest.fn() };
    const { service, tenantContext } = makeService(platform, distribution);
    distribution.autoDistribute.mockImplementation(async () => {
      tenantVisto = tenantContext.getTenantId();
    });

    await service.simulateInbound('tenant-42', MSG);

    expect(tenantVisto).toBe('tenant-42');
  });

  it('usa a fila configurada na conta quando houver', async () => {
    const platform = makePlatform();
    platform.whatsAppAccount.findUnique.mockResolvedValue({ defaultQueueId: 'fila-escolhida' });
    platform.queue.findFirst.mockImplementation(async ({ where }: any) =>
      where?.id === 'fila-escolhida' ? { id: 'fila-escolhida' } : { id: 'outra' },
    );
    const distribution = { autoDistribute: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeService(platform, distribution);

    await service.simulateInbound('tenant-1', MSG);

    expect(platform.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentQueueId: 'fila-escolhida' } }),
    );
  });

  it('sem fila ativa: não distribui, mas registra o lead sem quebrar', async () => {
    const platform = makePlatform();
    platform.queue.findFirst.mockResolvedValue(null);
    const distribution = { autoDistribute: jest.fn() };
    const { service } = makeService(platform, distribution);

    await expect(service.simulateInbound('tenant-1', MSG)).resolves.toBeUndefined();

    expect(platform.lead.create).toHaveBeenCalled(); // o lead não se perde
    expect(distribution.autoDistribute).not.toHaveBeenCalled();
  });

  it('falha na distribuição não derruba a captura do lead', async () => {
    const platform = makePlatform();
    const distribution = {
      autoDistribute: jest.fn().mockRejectedValue(new Error('motor fora do ar')),
    };
    const { service } = makeService(platform, distribution);

    await expect(service.simulateInbound('tenant-1', MSG)).resolves.toBeUndefined();

    // a mensagem e o lead foram gravados mesmo com a distribuição falhando
    expect(platform.lead.create).toHaveBeenCalled();
    expect(platform.message.create).toHaveBeenCalled();
  });
});
