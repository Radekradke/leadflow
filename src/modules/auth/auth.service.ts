import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformPrismaService } from '../../common/prisma/platform-prisma.service';
import { hashPassword, verifyPassword } from '../../common/security/password';
import { AuthenticatedUser, JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  /**
   * Hash "fantasma" calculado uma vez. Quando o e-mail não existe, ainda
   * assim verificamos a senha contra ELE — para o tempo de resposta ser
   * parecido com o de um usuário real. Sem isso, um atacante mede o tempo
   * e descobre QUAIS e-mails existem (enumeração).
   */
  private readonly dummyHash = hashPassword('valor-fantasma-sem-segredo');

  constructor(
    // Cliente ELEVADO de propósito: no login ainda não sabemos o tenant,
    // então não dá para usar o cliente de runtime (que é fail-closed).
    // É a exceção sancionada ao bypass de RLS.
    private readonly platformPrisma: PlatformPrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Confere e-mail + senha. Em QUALQUER falha, devolve a MESMA mensagem
   * genérica — nunca "e-mail não existe" vs "senha errada" — para não
   * vazar quais contas existem.
   */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.platformPrisma.user.findUnique({
      where: { email },
      include: {
        tenant: true,
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user) {
      // Queima tempo equivalente a uma verificação real (anti-enumeração).
      await verifyPassword(await this.dummyHash, password);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Usuário desativado não entra.
    if (!user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Tenant suspenso/cancelado bloqueia o login de todos os seus usuários.
    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELED') {
      throw new UnauthorizedException('Acesso indisponível no momento');
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.key);

    return {
      id: user.id,
      tenantId: user.tenantId,
      teamId: user.teamId,
      roleType: user.role.type,
      permissions,
    };
  }

  /** Assina o access token (JWT curto) a partir do usuário autenticado. */
  async signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      teamId: user.teamId,
      roleType: user.roleType,
      permissions: user.permissions,
    };
    return this.jwt.signAsync(payload);
  }

  /**
   * Recarrega o usuário autenticado pelo id (usado no refresh). Também
   * elevado, pois o refresh ocorre sem contexto de tenant. Este é o ponto
   * onde as permissões são RECARREGADAS do banco — limitando a defasagem
   * do token a cada renovação.
   */
  /**
   * Enriquece o usuário da sessão (que vem do JWT, enxuto) com nome/e-mail
   * para a UI. Usa o client elevado e filtra por id+tenant por garantia.
   */
  async enrichMe(user: AuthenticatedUser) {
    const profile = await this.platformPrisma.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId },
      select: { name: true, email: true },
    });
    return { ...user, name: profile?.name ?? null, email: profile?.email ?? null };
  }

  async loadById(userId: string): Promise<AuthenticatedUser> {
    const user = await this.platformPrisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.tenant.status === 'SUSPENDED' ||
      user.tenant.status === 'CANCELED'
    ) {
      throw new UnauthorizedException('Sessão inválida');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      teamId: user.teamId,
      roleType: user.role.type,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    };
  }

  /**
   * Conveniência usada pelo endpoint de login (a ser criado na próxima
   * entrega): valida e já devolve o token + o usuário. Quem grava o
   * cookie httpOnly e emite o refresh token é o controller, na parte 2.
   */
  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);
    const accessToken = await this.signAccessToken(user);
    return { user, accessToken };
  }
}
