import {
  BrokerCandidate,
  LeastLoadedStrategy,
  RandomStrategy,
  RoundRobinStrategy,
} from '../distribution.strategies';

const c = (id: string, activeCount = 0): BrokerCandidate => ({
  brokerProfileId: id,
  userId: 'u-' + id,
  name: id,
  activeCount,
  maxActiveLeads: 50,
});

describe('RoundRobinStrategy', () => {
  const s = new RoundRobinStrategy();
  const list = [c('b'), c('a'), c('c')]; // fora de ordem de propósito

  it('sem cursor, começa pelo primeiro em ordem estável (id)', () => {
    expect(s.pick(list, { lastAssignedBrokerProfileId: null }).brokerProfileId).toBe('a');
  });

  it('pega o próximo depois do último atribuído', () => {
    expect(s.pick(list, { lastAssignedBrokerProfileId: 'a' }).brokerProfileId).toBe('b');
    expect(s.pick(list, { lastAssignedBrokerProfileId: 'b' }).brokerProfileId).toBe('c');
  });

  it('dá a volta (wrap-around) no fim da lista', () => {
    expect(s.pick(list, { lastAssignedBrokerProfileId: 'c' }).brokerProfileId).toBe('a');
  });

  it('se o último não é mais elegível, recomeça do início', () => {
    expect(s.pick(list, { lastAssignedBrokerProfileId: 'zzz' }).brokerProfileId).toBe('a');
  });
});

describe('LeastLoadedStrategy', () => {
  const s = new LeastLoadedStrategy();
  it('escolhe quem tem menos leads ativos', () => {
    const list = [c('a', 5), c('b', 2), c('c', 9)];
    expect(s.pick(list).brokerProfileId).toBe('b');
  });
  it('empate é desempatado por id estável', () => {
    const list = [c('b', 3), c('a', 3)];
    expect(s.pick(list).brokerProfileId).toBe('a');
  });
});

describe('RandomStrategy', () => {
  const s = new RandomStrategy();
  it('sempre devolve um candidato da lista', () => {
    const list = [c('a'), c('b'), c('c')];
    for (let i = 0; i < 30; i++) {
      const picked = s.pick(list);
      expect(list.map((x) => x.brokerProfileId)).toContain(picked.brokerProfileId);
    }
  });
});
