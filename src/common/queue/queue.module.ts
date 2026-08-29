import { Module } from '@nestjs/common';
import { PgmqService } from './pgmq.service';

/**
 * Não é @Global de propósito: só quem publica (webhook do WhatsApp) e quem
 * consome (worker) devem enxergar isto. Mantém o raio de acesso ao cliente
 * elevado (via PgmqService) restrito a esses dois pontos.
 */
@Module({
  providers: [PgmqService],
  exports: [PgmqService],
})
export class QueueModule {}
