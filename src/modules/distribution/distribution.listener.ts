import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LEAD_CREATED, LeadCreatedEvent } from '../../common/events/app-events';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { DistributionService } from './distribution.service';

/**
 * Liga a criação de lead ao motor SEM acoplar os módulos: o módulo de leads
 * só emite um evento; quem sabe distribuir é a distribuição. Roda no mesmo
 * contexto async da requisição (AsyncLocalStorage preservado), então a RLS
 * enxerga o tenant normalmente.
 */
@Injectable()
export class DistributionListener {
  private readonly logger = new Logger(DistributionListener.name);

  constructor(
    private readonly distribution: DistributionService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(LEAD_CREATED)
  async handleLeadCreated(payload: LeadCreatedEvent): Promise<void> {
    try {
      // Abre um contexto de tenant PRÓPRIO em vez de herdar o da requisição:
      // o handler continua rodando depois da resposta, e em alguns ambientes
      // o AsyncLocalStorage da requisição não sobrevive a essa fronteira —
      // a RLS então devolve vazio e a distribuição morre em silêncio.
      // (Mesmo padrão do webhook do WhatsApp, que também abre o contexto na mão.)
      await this.tenantContext.run({ tenantId: payload.actor.tenantId }, () =>
        this.distribution.autoDistribute(payload.actor, payload.leadId),
      );
    } catch (err) {
      // Falha aqui não pode derrubar nada: o lead já está criado e pode ser
      // distribuído manualmente. Apenas registramos.
      this.logger.error(
        `Auto-distribuição falhou (lead ${payload.leadId}): ${String(err)}`,
      );
    }
  }
}
