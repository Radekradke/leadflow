import { Module } from '@nestjs/common';
import { DistributionController, LeadDistributionController } from './distribution.controller';
import { DistributionListener } from './distribution.listener';
import { DistributionService } from './distribution.service';
import {
  LeastLoadedStrategy,
  RandomStrategy,
  RoundRobinStrategy,
  STRATEGY_REGISTRY,
  StrategyRegistry,
} from './distribution.strategies';

@Module({
  controllers: [DistributionController, LeadDistributionController],
  providers: [
    DistributionService,
    DistributionListener,
    RoundRobinStrategy,
    LeastLoadedStrategy,
    RandomStrategy,
    {
      // Monta o mapa key -> estratégia. Adicionar uma estratégia nova é
      // só criar a classe e incluí-la aqui — o motor não muda.
      provide: STRATEGY_REGISTRY,
      inject: [RoundRobinStrategy, LeastLoadedStrategy, RandomStrategy],
      useFactory: (
        rr: RoundRobinStrategy,
        ll: LeastLoadedStrategy,
        rand: RandomStrategy,
      ): StrategyRegistry => {
        const map: StrategyRegistry = new Map();
        for (const s of [rr, ll, rand]) map.set(s.key, s);
        return map;
      },
    },
  ],
  exports: [DistributionService],
})
export class DistributionModule {}
