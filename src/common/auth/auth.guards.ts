import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../../modules/auth/auth.types';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './auth.decorators';

/**
 * Autenticação. Registrado como APP_GUARD => protege TUDO por padrão
 * (deny-by-default). Uma rota só fica aberta com @Public() explícito.
 * Esse default é de propósito: esquecer de proteger uma rota não deve
 * deixá-la aberta — deve deixá-la fechada.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

/**
 * Autorização por permissão (RBAC). Só atua quando a rota declara
 * @RequirePermissions(...). Compara o exigido com as permissões que
 * vieram no token. DEVE rodar DEPOIS do JwtAuthGuard.
 *
 * Lembrete: isto checa "PODE fazer a ação?". "PODE ver ESTE registro?"
 * (escopo por dono/equipe/tenant) é responsabilidade das queries nos
 * services — não deste guard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest()
      .user as AuthenticatedUser;

    if (!user?.permissions) {
      throw new ForbiddenException('Sem permissões no contexto');
    }

    const allowed = required.every((p) => user.permissions.includes(p));
    if (!allowed) {
      throw new ForbiddenException('Permissão insuficiente');
    }
    return true;
  }
}
