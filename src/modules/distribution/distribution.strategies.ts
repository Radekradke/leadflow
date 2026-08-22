import { Injectable } from '@nestjs/common';
import { DistributionStrategy as StrategyKey } from '@prisma/client';

/**
 * Candidato já filtrado e com a carga ativa calculada. O motor monta a
 * lista; a estratégia apenas ESCOLHE um — nada de I/O aqui dentro.
 */
export interface BrokerCandidate {
  brokerProfileId: string;
  userId: string;
  name: string;
  activeCount: number;
  maxActiveLeads: number;
}

export interface StrategyContext {
  /** Cursor do round-robin: quem recebeu o último lead desta fila. */
  lastAssignedBrokerProfileId: string | null;
}

export interface DistributionStrategy {
  readonly key: StrategyKey;
  pick(candidates: BrokerCandidate[], ctx: StrategyContext): BrokerCandidate;
}

/** Ordenação estável por id — garante determinismo no round-robin. */
const byId = (a: BrokerCandidate, b: BrokerCandidate) =>
  a.brokerProfileId.localeCompare(b.brokerProfileId);

/**
 * Reveza em ordem estável. Pega o próximo depois do último atribuído,
 * dando a volta. Se o último não está mais elegível, recomeça do início.
 */
@Injectable()
export class RoundRobinStrategy implements DistributionStrategy {
  readonly key = 'ROUND_ROBIN' as const;

  pick(candidates: BrokerCandidate[], ctx: StrategyContext): BrokerCandidate {
    const ordered = [...candidates].sort(byId);
    if (!ctx.lastAssignedBrokerProfileId) return ordered[0];

    const idx = ordered.findIndex(
      (c) => c.brokerProfileId === ctx.lastAssignedBrokerProfileId,
    );
    const next = idx === -1 ? 0 : (idx + 1) % ordered.length;
    return ordered[next];
  }
}

/** Quem tem menos leads ativos (empate: id estável). Equilibra a carga. */
@Injectable()
export class LeastLoadedStrategy implements DistributionStrategy {
  readonly key = 'LEAST_LOADED' as const;

  pick(candidates: BrokerCandidate[]): BrokerCandidate {
    return [...candidates].sort(
      (a, b) => a.activeCount - b.activeCount || byId(a, b),
    )[0];
  }
}

/** Sorteio uniforme. Útil p/ A/B ou quando não se quer previsibilidade. */
@Injectable()
export class RandomStrategy implements DistributionStrategy {
  readonly key = 'RANDOM' as const;

  pick(candidates: BrokerCandidate[]): BrokerCandidate {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

/** Token + tipo do registry (mapa key -> estratégia), montado no módulo. */
export const STRATEGY_REGISTRY = Symbol('STRATEGY_REGISTRY');
export type StrategyRegistry = Map<StrategyKey, DistributionStrategy>;
