import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PgmqService } from '../common/queue/pgmq.service';
import { WhatsAppInboundService } from '../modules/whatsapp/whatsapp.inbound.service';

const QUEUE_NAME = 'whatsapp_inbound';

/**
 * Consome a fila `whatsapp_inbound`: pega o payload cru que o webhook só
 * gravou (sem processar) e roda exatamente o mesmo caminho de ingestão de
 * antes (`WhatsAppInboundService.handleEvent`, sem nenhuma mudança nela —
 * ela já sabe abrir o contexto de tenant sozinha).
 *
 * Pode rodar de dois jeitos, sem mudar uma linha de código:
 *   - dentro do processo da API (`main.ts`, se RUN_QUEUE_WORKER_IN_PROCESS
 *     != 'false') — é o modo do milestone 1, um serviço só, mais barato.
 *   - num processo à parte (`worker.ts`) — quando o volume justificar isolar
 *     o processamento do tráfego HTTP, é só apontar um serviço novo pro
 *     mesmo `dist/worker.js`, sem reescrever nada.
 */
@Injectable()
export class QueueWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkerService.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private polling = false;

  constructor(
    private readonly queue: PgmqService,
    private readonly inbound: WhatsAppInboundService,
  ) {}

  start(): void {
    const intervalMs = Number(process.env.QUEUE_POLL_INTERVAL_MS ?? 2000);
    this.logger.log(`Worker de fila iniciado (poll a cada ${intervalMs}ms).`);
    this.timer = setInterval(() => void this.pollOnce(), intervalMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async pollOnce(): Promise<void> {
    // Evita sobrepor execuções se um lote demorar mais que o intervalo.
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const visibilitySeconds = Number(
        process.env.QUEUE_VISIBILITY_TIMEOUT_SECONDS ?? 30,
      );
      const messages = await this.queue.read(QUEUE_NAME, visibilitySeconds, 5);
      for (const msg of messages) {
        try {
          await this.inbound.handleEvent(msg.message);
          await this.queue.ack(QUEUE_NAME, msg.msgId);
        } catch (err) {
          // Não confirma: some da visibilidade e volta sozinha depois do
          // timeout acima. Sem DLQ customizado neste milestone.
          this.queue.logFailure(QUEUE_NAME, msg.msgId, err);
        }
      }
    } catch (err) {
      this.logger.error(`Erro lendo a fila ${QUEUE_NAME}: ${String(err)}`);
    } finally {
      this.polling = false;
    }
  }
}
