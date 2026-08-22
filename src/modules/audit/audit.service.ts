import { Injectable, Logger } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { PlatformPrismaService } from '../../common/prisma/platform-prisma.service';

export type AuditEntry = {
  tenantId?: string | null;
  actorId?: string | null;
  actorType: ActorType;
  action: string; // namespaced: "auth.login.success", "lead.transfer"...
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly platformPrisma: PlatformPrismaService) {}

  /**
   * Grava um evento de auditoria.
   *
   * Usa o cliente ELEVADO porque vários eventos ocorrem SEM contexto de
   * tenant (login falho, ações de plataforma). NUNCA registre dado
   * sensível (CPF, renda, senha) — isto é "quem fez o quê", não o
   * conteúdo.
   *
   * Falhas de auditoria são ENGOLIDAS: registrar o log não pode derrubar
   * a operação principal. Em produção, ligue este catch a um alerta.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.platformPrisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          actorId: entry.actorId ?? null,
          actorType: entry.actorType,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          ip: entry.ip,
          userAgent: entry.userAgent,
          // Prisma.InputJsonValue — cast pontual para o tipo Json do Prisma
          metadata: entry.metadata as object | undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Falha ao gravar AuditLog (${entry.action})`,
        err as Error,
      );
    }
  }
}
