import { DistributionService } from '../distribution.service';

/**
 * Cadeia de distribuição: Regional → Gerentes → Corretores.
 *
 * O que estes testes garantem:
 *  - fila sem filhas continua funcionando como antes (nada quebrou);
 *  - os percentuais são respeitados de verdade (60/40 dá 60/40);
 *  - se a equipe de um gerente está indisponível, o lead vai para o outro
 *    em vez de ficar parado.
 */

type FakeQueue = {
  id: string;
  parentId: string | null;
  routingWeight: number;
  routedCount: number;
  isActive?: boolean;
  distributionEnabled?: boolean;
};

/** Banco de mentira, só com o necessário para o roteamento. */
function makeTrx(queues: FakeQueue[], brokersByQueue: Record<string, number>) {
  const state = queues.map((q) => ({
    isActive: true,
    distributionEnabled: true,
    ...q,
  }));

  return {
    _state: state,
    queue: {
      findMany: jest.fn(async ({ where }: any) =>
        state
          .filter(
            (q) =>
              q.parentId === where.parentId &&
              q.isActive === true &&
              q.distributionEnabled === true,
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((q) => ({
            id: q.id,
            routingWeight: q.routingWeight,
            routedCount: q.routedCount,
          })),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const q = state.find((x) => x.id === where.id)!;
        if (data?.routedCount?.increment) q.routedCount += data.routedCount.increment;
        return q;
      }),
    },
    // Cada corretor "disponível" da fila vira uma linha de membership.
    queueMembership: {
      findMany: jest.fn(async ({ where }: any) =>
        Array.from({ length: brokersByQueue[where.queueId] ?? 0 }, (_, i) => ({
          brokerProfile: {
            id: `${where.queueId}-b${i}`,
            availability: 'AVAILABLE',
            acceptsDistribution: true,
            maxActiveLeads: 50,
            user: { isActive: true },
          },
        })),
      ),
    },
    leadAssignment: {
      count: jest.fn(async () => 0), // ninguém no limite
    },
  } as any;
}

/** Chama o método privado de resolução (é o miolo do roteamento). */
function resolve(service: DistributionService, trx: any, queueId: string) {
  return (service as any).resolveLeafQueue(trx, queueId) as Promise<string>;
}

function makeService(): DistributionService {
  // O roteamento não usa prisma/audit/strategies — só o trx que recebe.
  return new DistributionService({} as any, {} as any, {} as any);
}

describe('Cadeia de distribuição', () => {
  it('fila SEM filhas devolve ela mesma (comportamento antigo intacto)', async () => {
    const service = makeService();
    const trx = makeTrx([{ id: 'fila-unica', parentId: null, routingWeight: 50, routedCount: 0 }], {
      'fila-unica': 2,
    });

    await expect(resolve(service, trx, 'fila-unica')).resolves.toBe('fila-unica');
    expect(trx.queue.update).not.toHaveBeenCalled(); // não roteou nada
  });

  it('regional 60/40: em 100 leads, a proporção é exata', async () => {
    const service = makeService();
    const trx = makeTrx(
      [
        { id: 'regional', parentId: null, routingWeight: 100, routedCount: 0 },
        { id: 'g1-marcio', parentId: 'regional', routingWeight: 60, routedCount: 0 },
        { id: 'g2-wellington', parentId: 'regional', routingWeight: 40, routedCount: 0 },
      ],
      { 'g1-marcio': 2, 'g2-wellington': 2 },
    );

    const contagem: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const leaf = await resolve(service, trx, 'regional');
      contagem[leaf] = (contagem[leaf] ?? 0) + 1;
    }

    expect(contagem['g1-marcio']).toBe(60);
    expect(contagem['g2-wellington']).toBe(40);
  });

  it('não aglomera: alterna entre os gerentes desde o começo', async () => {
    const service = makeService();
    const trx = makeTrx(
      [
        { id: 'regional', parentId: null, routingWeight: 100, routedCount: 0 },
        { id: 'a', parentId: 'regional', routingWeight: 50, routedCount: 0 },
        { id: 'b', parentId: 'regional', routingWeight: 50, routedCount: 0 },
      ],
      { a: 1, b: 1 },
    );

    const seq: string[] = [];
    for (let i = 0; i < 6; i++) seq.push(await resolve(service, trx, 'regional'));

    expect(seq).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
  });

  it('gerente sem corretor disponível: o lead vai para o outro', async () => {
    const service = makeService();
    const trx = makeTrx(
      [
        { id: 'regional', parentId: null, routingWeight: 100, routedCount: 0 },
        { id: 'g1', parentId: 'regional', routingWeight: 90, routedCount: 0 },
        { id: 'g2', parentId: 'regional', routingWeight: 10, routedCount: 0 },
      ],
      { g1: 0, g2: 1 }, // equipe do g1 toda offline
    );

    // Mesmo com 90% do peso, g1 não pode receber.
    for (let i = 0; i < 5; i++) {
      await expect(resolve(service, trx, 'regional')).resolves.toBe('g2');
    }
  });

  it('peso 0 desliga o ramo sem apagar a configuração', async () => {
    const service = makeService();
    const trx = makeTrx(
      [
        { id: 'regional', parentId: null, routingWeight: 100, routedCount: 0 },
        { id: 'ativo', parentId: 'regional', routingWeight: 100, routedCount: 0 },
        { id: 'pausado', parentId: 'regional', routingWeight: 0, routedCount: 0 },
      ],
      { ativo: 2, pausado: 2 },
    );

    for (let i = 0; i < 10; i++) {
      await expect(resolve(service, trx, 'regional')).resolves.toBe('ativo');
    }
  });

  it('desce mais de um nível (regional → sub-regional → gerente)', async () => {
    const service = makeService();
    const trx = makeTrx(
      [
        { id: 'regional', parentId: null, routingWeight: 100, routedCount: 0 },
        { id: 'sub', parentId: 'regional', routingWeight: 100, routedCount: 0 },
        { id: 'gerente', parentId: 'sub', routingWeight: 100, routedCount: 0 },
      ],
      { gerente: 1 },
    );

    await expect(resolve(service, trx, 'regional')).resolves.toBe('gerente');
  });

  it('nenhum ramo pode receber: ainda escolhe um (o lead não some)', async () => {
    const service = makeService();
    const trx = makeTrx(
      [
        { id: 'regional', parentId: null, routingWeight: 100, routedCount: 0 },
        { id: 'g1', parentId: 'regional', routingWeight: 60, routedCount: 0 },
        { id: 'g2', parentId: 'regional', routingWeight: 40, routedCount: 0 },
      ],
      { g1: 0, g2: 0 }, // ninguém disponível em lugar nenhum
    );

    const leaf = await resolve(service, trx, 'regional');
    // Cai numa folha; o motor registra NO_CANDIDATES e o lead fica
    // aguardando distribuição manual — mas não se perde.
    expect(['g1', 'g2']).toContain(leaf);
  });
});
