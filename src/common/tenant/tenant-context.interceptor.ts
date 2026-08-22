import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * Roda DEPOIS dos guards (ordem do Nest: guard -> interceptor -> handler).
 * Nesse ponto o JwtAuthGuard já validou o token e populou request.user.
 * Copiamos o tenant do usuário autenticado para o contexto da requisição.
 *
 * REGRA: o tenant vem do USUÁRIO autenticado, NUNCA de header, query
 * string ou body. Tenant é identidade, não input. Aceitar tenant do
 * cliente seria o IDOR mais catastrófico possível num SaaS.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // preenchido pelo JwtAuthGuard (passo do login)

    if (user?.tenantId) {
      this.tenantContext.setTenant(user.tenantId, user.id);
    }
    return next.handle();
  }
}
