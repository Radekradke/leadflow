import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard, PermissionsGuard } from '../../common/auth/auth.guards';
import { CsrfGuard } from '../../common/auth/csrf.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Importar este módulo liga: autenticação global (deny-by-default),
 * proteção CSRF global e autorização por permissão.
 *
 * Ordem dos APP_GUARD (importa!):
 *   1. JwtAuthGuard     -> autentica e popula request.user
 *   2. CsrfGuard        -> valida o token CSRF em métodos que alteram estado
 *   3. PermissionsGuard -> checa a permissão exigida pela rota
 *
 * PlatformPrismaService (usado por AuthService e RefreshTokenService) vem
 * do PrismaModule, que é @Global.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    PasswordResetService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
