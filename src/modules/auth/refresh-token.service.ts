import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PlatformPrismaService } from '../../common/prisma/platform-prisma.service';
import { generateOpaqueToken, sha256 } from '../../common/security/token.util';
import { AuditService } from '../audit/audit.service';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

type SessionMeta = { userAgent?: string; ip?: string };

/**
 * Gerencia os refresh tokens. Usa o cliente ELEVADO porque login/refresh/
 * logout ocorrem sem contexto de tenant. Guarda apenas o HASH do token.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cria uma NOVA família de refresh (no login). Devolve o token cru. */
  async issue(
    user: { id: string; tenantId: string },
    meta: SessionMeta,
  ): Promise<string> {
    const token = generateOpaqueToken();
    await this.platformPrisma.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        familyId: generateOpaqueToken(16),
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    return token;
  }

  /**
   * Rotaciona o refresh: invalida o antigo e emite um novo na MESMA
   * família. Devolve o novo token + a quem pertence.
   *
   * DETECÇÃO DE REUSO (o pulo do gato): um refresh só pode ser usado UMA
   * vez. Se chega um token já revogado/substituído, alguém tem uma cópia
   * antiga — provável roubo. Revogamos a família INTEIRA e registramos o
   * incidente. É a diferença entre "vazou um token" e "a conta está
   * comprometida para sempre".
   */
  async rotate(
    rawToken: string,
    meta: SessionMeta,
  ): Promise<{ token: string; userId: string; tenantId: string }> {
    const tokenHash = sha256(rawToken);
    const current = await this.platformPrisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!current) {
      throw new UnauthorizedException('Sessão inválida');
    }

    if (current.revokedAt || current.replacedById) {
      await this.revokeFamily(current.familyId);
      await this.audit.record({
        tenantId: current.tenantId,
        actorId: current.userId,
        actorType: 'USER',
        action: 'auth.refresh.reuse_detected',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { familyId: current.familyId },
      });
      throw new UnauthorizedException('Sessão revogada por segurança');
    }

    if (current.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    const newToken = generateOpaqueToken();
    const created = await this.platformPrisma.refreshToken.create({
      data: {
        tenantId: current.tenantId,
        userId: current.userId,
        familyId: current.familyId, // mesma cadeia
        tokenHash: sha256(newToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    await this.platformPrisma.refreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });

    return {
      token: newToken,
      userId: current.userId,
      tenantId: current.tenantId,
    };
  }

  /** Revoga o token atual (logout). */
  async revoke(rawToken: string): Promise<void> {
    await this.platformPrisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Mata a cadeia inteira (reuso detectado ou "sair de todos os dispositivos"). */
  async revokeFamily(familyId: string): Promise<void> {
    await this.platformPrisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoga TODAS as sessões ativas de um usuário. Usado quando a senha é
   * trocada: quem tinha sessão aberta (inclusive um invasor) é derrubado
   * e obrigado a logar de novo com a senha nova.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.platformPrisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
