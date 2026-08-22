import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../common/mail/mail.service';
import { PlatformPrismaService } from '../../common/prisma/platform-prisma.service';
import { hashPassword } from '../../common/security/password';
import { generateOpaqueToken, sha256 } from '../../common/security/token.util';
import { AuditService } from '../audit/audit.service';
import { RefreshTokenService } from './refresh-token.service';

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutos — janela curta de propósito

type Meta = { ip?: string; userAgent?: string };

/**
 * Fluxo de "esqueci a senha". Roda SEM contexto de tenant (o usuário não
 * está logado), então usa o cliente ELEVADO — a mesma exceção sancionada
 * do login/refresh.
 *
 * Princípios de segurança aplicados:
 *  - ANTI-ENUMERAÇÃO: solicitar reset SEMPRE responde igual, exista o
 *    e-mail ou não. O controller devolve 200 nos dois casos.
 *  - TOKEN OPACO + SÓ HASH NO BANCO: o que vai no e-mail é aleatório; se
 *    o banco vazar, não dá para reusar.
 *  - USO ÚNICO + VALIDADE CURTA: usedAt + expiresAt (30 min).
 *  - INVALIDA TOKENS ANTERIORES: pedir um novo reset queima os pendentes.
 *  - DERRUBA SESSÕES: ao trocar a senha, todas as sessões são revogadas.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly mail: MailService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Solicita o reset. NÃO revela se o e-mail existe. Se existir e a conta
   * estiver utilizável, gera o token e dispara o e-mail.
   */
  async request(email: string, meta: Meta): Promise<void> {
    const user = await this.platformPrisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { status: true } } },
    });

    // Silenciosamente não faz nada se: e-mail inexistente, conta
    // desativada, ou tenant suspenso/cancelado. Resposta ao cliente é a
    // mesma — anti-enumeração.
    if (
      !user ||
      !user.isActive ||
      user.tenant.status === 'SUSPENDED' ||
      user.tenant.status === 'CANCELED'
    ) {
      return;
    }

    // Queima tokens pendentes deste usuário (só um reset válido por vez).
    await this.platformPrisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = generateOpaqueToken(32);
    await this.platformPrisma.passwordResetToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    const base = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    const link = `${base}/reset-password?token=${token}`;
    await this.mail.sendPasswordReset(user.email, link);

    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: 'USER',
      action: 'auth.password_reset.requested',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /**
   * Efetiva a troca. Valida o token (existe, não usado, não expirado),
   * grava o novo hash Argon2id, marca o token como usado e DERRUBA todas
   * as sessões do usuário.
   */
  async reset(rawToken: string, newPassword: string, meta: Meta): Promise<void> {
    const record = await this.platformPrisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });

    // Mensagem genérica para qualquer falha — não diz se o token nunca
    // existiu, se expirou ou se já foi usado.
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Link inválido ou expirado. Solicite um novo.');
    }

    const passwordHash = await hashPassword(newPassword);

    await this.platformPrisma.$transaction([
      this.platformPrisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.platformPrisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Tudo que estava logado cai — inclusive um eventual invasor.
    await this.refreshTokens.revokeAllForUser(record.userId);

    await this.audit.record({
      tenantId: record.tenantId,
      actorId: record.userId,
      actorType: 'USER',
      action: 'auth.password_reset.completed',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
