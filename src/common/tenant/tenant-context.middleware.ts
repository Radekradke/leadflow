import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

/**
 * Abre o contexto da requisição bem no começo, ainda VAZIO.
 *
 * O tenant só é conhecido depois que a autenticação valida o usuário —
 * quem PREENCHE o tenantId é o TenantContextInterceptor, que roda após
 * o guard de auth. Aqui apenas garantimos que existe um "store" vivo
 * durante toda a requisição, para o interceptor ter onde escrever e a
 * extensão do Prisma ter onde ler.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.tenantContext.run({}, () => next());
  }
}
