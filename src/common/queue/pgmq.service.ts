import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '../prisma/platform-prisma.service';

export type PgmqMessage<T = unknown> = {
  msgId: number;
  readCt: number;
  enqueuedAt: Date;
  message: T;
};

/**
 * Wrapper fino em cima da extensão `pgmq` (fila persistida no próprio
 * Postgres — free no Supabase, zero infra nova).
 *
 * Usa o cliente ELEVADO (`PlatformPrismaService`) de propósito: as tabelas
 * do pgmq vivem no schema `pgmq`, não são dado de tenant e não têm RLS —
 * é o mesmo raciocínio que já vale pra login/onboarding. Este serviço NUNCA
 * deve tocar tabelas de negócio (Lead, User, etc.) diretamente; só chama as
 * funções `pgmq.*`. Se um dia precisar disso, é sinal de que o serviço
 * cresceu além do que devia.
 */
@Injectable()
export class PgmqService {
  private readonly logger = new Logger(PgmqService.name);

  constructor(private readonly platform: PlatformPrismaService) {}

  /** Publica uma mensagem na fila. Serializa como JSON. */
  async send(queueName: string, payload: unknown): Promise<number> {
    const rows = await this.platform.$queryRaw<{ send: bigint }[]>`
      SELECT pgmq.send(${queueName}, ${JSON.stringify(payload)}::jsonb) AS send
    `;
    return Number(rows[0].send);
  }

  /**
   * Lê até `qty` mensagens, tornando-as invisíveis por `visibilitySeconds`.
   * Se o processamento não chamar `ack` dentro desse prazo (worker caiu no
   * meio, por exemplo), a mensagem volta a ficar visível sozinha — é o
   * retry "de graça" que substitui uma DLQ customizada neste milestone.
   */
  async read<T = unknown>(
    queueName: string,
    visibilitySeconds: number,
    qty = 1,
  ): Promise<PgmqMessage<T>[]> {
    const rows = await this.platform.$queryRaw<
      { msg_id: bigint; read_ct: number; enqueued_at: Date; message: T }[]
    >`
      SELECT msg_id, read_ct, enqueued_at, message
      FROM pgmq.read(${queueName}, ${visibilitySeconds}, ${qty})
    `;
    return rows.map((r) => ({
      msgId: Number(r.msg_id),
      readCt: r.read_ct,
      enqueuedAt: r.enqueued_at,
      message: r.message,
    }));
  }

  /** Confirma o processamento (remove definitivamente da fila). */
  async ack(queueName: string, msgId: number): Promise<void> {
    await this.platform.$executeRaw`SELECT pgmq.delete(${queueName}, ${msgId}::bigint)`;
  }

  /** Loga e deixa a mensagem expirar a visibilidade (retry automático). */
  logFailure(queueName: string, msgId: number, err: unknown): void {
    this.logger.error(
      `Falha processando msg ${msgId} da fila ${queueName}: ${String(err)} — volta pra fila após o timeout de visibilidade.`,
    );
  }
}
