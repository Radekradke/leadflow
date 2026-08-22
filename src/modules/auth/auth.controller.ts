import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/auth.decorators';
import { SkipCsrf } from '../../common/auth/csrf.guard';
import { generateOpaqueToken } from '../../common/security/token.util';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { LoginDto, loginSchema } from './dto/login.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './dto/password-reset.dto';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';

function sessionMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly passwordReset: PasswordResetService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Login: público (sem sessão ainda) e isento de CSRF (sem cookie csrf
   * ainda). Rate limit AGRESSIVO: 5 tentativas por minuto por IP — freia
   * força bruta e credential stuffing.
   */
  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = sessionMeta(req);
    try {
      const { user, accessToken } = await this.authService.login(
        dto.email,
        dto.password,
      );
      const refreshToken = await this.refreshTokens.issue(user, meta);
      setAuthCookies(res, {
        accessToken,
        refreshToken,
        csrfToken: generateOpaqueToken(16),
      });

      await this.audit.record({
        tenantId: user.tenantId,
        actorId: user.id,
        actorType: 'USER',
        action: 'auth.login.success',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return { user };
    } catch (err) {
      // Registra a TENTATIVA falha. O e-mail tentado entra no metadata:
      // é necessário para detectar ataque (não é dado sensível como CPF).
      await this.audit.record({
        actorType: 'ANONYMOUS',
        action: 'auth.login.failure',
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { email: dto.email },
      });
      throw err;
    }
  }

  /**
   * Refresh: público (o access token pode estar expirado), mas a CSRF É
   * exigida. Rotaciona o refresh e recarrega as permissões do banco.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.['refresh_token'];
    if (!raw) throw new UnauthorizedException('Sessão ausente');

    const rotated = await this.refreshTokens.rotate(raw, sessionMeta(req));
    const user = await this.authService.loadById(rotated.userId);
    const accessToken = await this.authService.signAccessToken(user);

    setAuthCookies(res, {
      accessToken,
      refreshToken: rotated.token,
      csrfToken: generateOpaqueToken(16),
    });
    return { user };
  }

  /** Logout: revoga o refresh atual e limpa os cookies. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = sessionMeta(req);
    const raw = req.cookies?.['refresh_token'];
    if (raw) await this.refreshTokens.revoke(raw);
    clearAuthCookies(res);

    const user = req.user as AuthenticatedUser | undefined;
    await this.audit.record({
      tenantId: user?.tenantId ?? null,
      actorId: user?.id ?? null,
      actorType: user ? 'USER' : 'ANONYMOUS',
      action: 'auth.logout',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /**
   * Solicita reset de senha. Público, isento de CSRF (sem sessão) e com
   * rate limit apertado. SEMPRE responde 200 com a mesma mensagem — exista
   * o e-mail ou não — para não revelar quais contas existem.
   */
  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
    @Req() req: Request,
  ) {
    await this.passwordReset.request(dto.email, sessionMeta(req));
    return { message: 'Se houver uma conta com este e-mail, enviamos as instruções.' };
  }

  /**
   * Efetiva a troca de senha a partir do token recebido por e-mail.
   * Público, isento de CSRF, com rate limit. Ao concluir, todas as
   * sessões do usuário são derrubadas.
   */
  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    await this.passwordReset.reset(dto.token, dto.password, sessionMeta(req));
  }

  /** Quem sou eu — o frontend usa para hidratar a sessão ao abrir o app. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.enrichMe(user);
  }
}
