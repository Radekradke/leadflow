import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/** Marca uma rota como isenta de CSRF (ex.: o login, que ainda não tem cookie). */
export const SKIP_CSRF_KEY = 'skipCsrf';
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF por "double-submit cookie". Em requisições que ALTERAM
 * estado (POST/PUT/PATCH/DELETE), exige que o header X-CSRF-Token seja
 * igual ao cookie csrf_token.
 *
 * Por que funciona: um site malicioso até consegue fazer o navegador
 * ENVIAR o cookie da vítima, mas NÃO consegue LER o valor (é de outra
 * origem) nem setar um header customizado numa requisição cross-site.
 * Sem header igual ao cookie, não passa.
 *
 * Registrado como APP_GUARD => protege tudo por padrão. Métodos seguros e
 * rotas @SkipCsrf passam direto.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    if (SAFE_METHODS.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.['csrf_token'];

    if (!cookieToken || !headerToken || headerToken !== cookieToken) {
      throw new ForbiddenException('Falha na verificação CSRF');
    }
    return true;
  }
}
