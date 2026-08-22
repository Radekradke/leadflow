import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '../../common/prisma/platform-prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { DistributionService, systemActor } from '../distribution/distribution.service';
import { normalizePhone } from './whatsapp.signature';

/**
 * Processa os eventos do WEBHOOK da Meta. Roda SEM contexto de tenant (a
 * Meta chama direto), então usa o cliente ELEVADO e resolve o tenant pelo
 * phoneNumberId — sempre gravando o tenantId explicitamente.
 *
 * Idempotência: cada mensagem tem o id da Meta (waMessageId, @unique);
 * reentregas (a Meta reenvia em caso de falha) são ignoradas.
 */
@Injectable()
export class WhatsAppInboundService {
  private readonly logger = new Logger(WhatsAppInboundService.name);
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly distribution: DistributionService,
  ) {}

  /** Resolve a conta pelo phoneNumberId (1ª coisa do webhook). */
  async accountByPhoneNumberId(phoneNumberId: string) {
    return this.platform.whatsAppAccount.findUnique({ where: { phoneNumberId } });
  }

  /** Ponto de entrada: processa o payload já validado. */
  async handleEvent(payload: any): Promise<void> {
    const entries = payload?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        if (!value) continue;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const acc = await this.accountByPhoneNumberId(phoneNumberId);
        if (!acc || !acc.active) {
          this.logger.warn(`Webhook para phoneNumberId desconhecido/inativo: ${phoneNumberId}`);
          continue;
        }
        const contactName = value?.contacts?.[0]?.profile?.name as string | undefined;

        for (const msg of value?.messages ?? []) {
          await this.ingestMessage(acc.tenantId, msg, contactName).catch((e) =>
            this.logger.error(`Falha ao ingerir mensagem: ${(e as Error).message}`),
          );
        }
        for (const st of value?.statuses ?? []) {
          await this.applyStatus(st).catch(() => undefined);
        }
      }
    }
  }

  /**
   * Simula uma mensagem recebida (modo dev/teste) — reaproveita exatamente
   * o mesmo caminho de ingestão do webhook real, mas sem a Meta. Cria/associa
   * o lead e grava a conversa, como se o cliente tivesse mandado no WhatsApp.
   */
  async simulateInbound(
    tenantId: string,
    input: { from: string; name?: string; text: string; adHeadline?: string; adSourceId?: string },
  ): Promise<void> {
    const syntheticMsg = {
      id: 'sim-in-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      from: input.from,
      type: 'text',
      text: { body: input.text },
      timestamp: String(Math.floor(Date.now() / 1000)),
      // Simula um lead vindo de anúncio, para testar a atribuição.
      ...(input.adHeadline || input.adSourceId
        ? {
            referral: {
              source_id: input.adSourceId || 'sim-ad-' + Date.now(),
              source_type: 'ad',
              headline: input.adHeadline,
              ctwa_clid: 'sim-clid-' + Date.now(),
            },
          }
        : {}),
    };
    await this.ingestMessage(tenantId, syntheticMsg, input.name);
  }

  private async ingestMessage(tenantId: string, msg: any, contactName?: string): Promise<void> {
    const waMessageId: string = msg?.id;
    if (!waMessageId) return;

    // Idempotência: já vimos essa mensagem?
    const exists = await this.platform.message.findUnique({ where: { waMessageId } });
    if (exists) return;

    const fromDigits = normalizePhone(msg?.from);
    const body = this.extractBody(msg);
    const when = msg?.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();

    // Anúncio de origem (Click-to-WhatsApp): só vem na PRIMEIRA mensagem.
    const referral = msg?.referral ?? null;
    const { lead, created } = await this.findOrCreateLead(
      tenantId,
      fromDigits,
      contactName,
      referral,
    );
    const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const conv = await this.platform.conversation.upsert({
      where: { leadId: lead.id },
      create: {
        tenantId,
        leadId: lead.id,
        waPhone: fromDigits,
        lastMessageAt: when,
        lastMessageText: body,
        unreadCount: 1,
        windowExpiresAt,
      },
      update: {
        lastMessageAt: when,
        lastMessageText: body,
        unreadCount: { increment: 1 },
        windowExpiresAt,
      },
    });

    await this.platform.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: 'INBOUND',
        waMessageId,
        body,
        status: 'RECEIVED',
        createdAt: when,
      },
    });

    // Mantém o "último contato" do lead em dia.
    await this.platform.lead.update({
      where: { id: lead.id },
      data: { lastContactAt: when },
    });

    // Lead NOVO → distribui na hora. Lead já existente já tem corretor;
    // redistribuir seria roubar o atendimento de quem já está na conversa.
    if (created) {
      const adSourceId = referral?.source_id ? String(referral.source_id) : null;
      await this.distributeNewLead(tenantId, lead.id, adSourceId).catch((e) =>
        this.logger.error(`Distribuição automática falhou: ${(e as Error).message}`),
      );
    }
  }

  /**
   * Coloca o lead numa fila e roda o motor de distribuição.
   *
   * Detalhe importante: o motor usa o cliente com RLS, que descobre o tenant
   * pelo AsyncLocalStorage. Como o webhook não tem contexto (a Meta chama
   * direto, sem login), abrimos um contexto na mão com o tenant que
   * resolvemos pelo phoneNumberId. Sem isso, a RLS não enxergaria nada.
   */
  private async distributeNewLead(
    tenantId: string,
    leadId: string,
    adSourceId: string | null = null,
  ): Promise<void> {
    const queueId = await this.resolveEntryQueue(tenantId, adSourceId);
    if (!queueId) {
      this.logger.warn(
        `Tenant ${tenantId} sem fila ativa: lead ${leadId} ficou aguardando distribuição manual.`,
      );
      return;
    }

    // Precisa estar na fila ANTES: o autoDistribute lê a fila do lead e
    // respeita a flag distributionEnabled dela.
    await this.platform.lead.update({
      where: { id: leadId },
      data: { currentQueueId: queueId },
    });

    await this.tenantContext.run({ tenantId }, () =>
      this.distribution.autoDistribute(systemActor(tenantId), leadId),
    );
  }

  /**
   * Fila de entrada do WhatsApp: a configurada na conta; senão, a primeira
   * fila ativa com distribuição ligada; senão, qualquer fila ativa.
   */
  private async resolveEntryQueue(
    tenantId: string,
    adSourceId: string | null = null,
  ): Promise<string | null> {
    // 1º) Roteamento por ANÚNCIO. É o mais específico: o lead que clicou no
    //     anúncio de Queimados vai para o regional de Queimados, e assim por
    //     diante. Se o anúncio não estiver mapeado, cai nas regras abaixo.
    if (adSourceId) {
      const route = await this.platform.adRoute.findFirst({
        where: { tenantId, adSourceId },
        select: { queueId: true, label: true },
      });
      if (route) {
        const queue = await this.platform.queue.findFirst({
          where: { id: route.queueId, tenantId, isActive: true },
          select: { id: true },
        });
        if (queue) return queue.id;
        this.logger.warn(
          `Anúncio ${adSourceId} aponta para uma fila inexistente/inativa — usando a fila padrão.`,
        );
      }
    }

    const acc = await this.platform.whatsAppAccount.findUnique({
      where: { tenantId },
      select: { defaultQueueId: true },
    });

    if (acc?.defaultQueueId) {
      const configured = await this.platform.queue.findFirst({
        where: { id: acc.defaultQueueId, tenantId, isActive: true },
        select: { id: true },
      });
      if (configured) return configured.id;
      this.logger.warn(
        `Fila padrão do WhatsApp (${acc.defaultQueueId}) não existe ou está inativa — usando fallback.`,
      );
    }

    const enabled = await this.platform.queue.findFirst({
      where: { tenantId, isActive: true, distributionEnabled: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (enabled) return enabled.id;

    const anyActive = await this.platform.queue.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return anyActive?.id ?? null;
  }

  /** Texto direto; outros tipos viram um marcador para não se perder. */
  private extractBody(msg: any): string {
    const type = msg?.type;
    if (type === 'text') return msg?.text?.body ?? '';
    if (type === 'button') return msg?.button?.text ?? '[resposta de botão]';
    if (type === 'interactive') {
      return (
        msg?.interactive?.button_reply?.title ??
        msg?.interactive?.list_reply?.title ??
        '[resposta interativa]'
      );
    }
    return `[${type ?? 'mídia'} recebido]`;
  }

  /**
   * Acha o lead pelo telefone (comparando os últimos 8 dígitos) ou cria um
   * novo, com origem WHATSAPP e aguardando distribuição. O gestor distribui
   * pelo fluxo normal (a distribuição automática a partir do webhook fica
   * como evolução — exige rodar o motor dentro do contexto do tenant).
   */
  private async findOrCreateLead(
    tenantId: string,
    fromDigits: string,
    contactName?: string,
    referral?: any,
  ) {
    const last8 = fromDigits.slice(-8);
    if (last8) {
      const found = await this.platform.lead.findFirst({
        where: {
          tenantId,
          OR: [{ phone: { contains: last8 } }, { whatsapp: { contains: last8 } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (found) {
        // Se o lead já existia sem atribuição e agora veio de um anúncio,
        // aproveita para registrar (não sobrescreve o que já estava lá).
        if (referral?.source_id && !found.adSourceId) {
          await this.platform.lead.update({
            where: { id: found.id },
            data: {
              adSourceId: String(referral.source_id),
              adHeadline: referral.headline ? String(referral.headline) : null,
              ctwaClid: referral.ctwa_clid ? String(referral.ctwa_clid) : null,
            },
          });
        }
        return { lead: found, created: false };
      }
    }
    const pretty = fromDigits ? `+${fromDigits}` : 'desconhecido';
    const lead = await this.platform.lead.create({
      data: {
        tenantId,
        name: contactName?.trim() || `Contato WhatsApp ${pretty}`,
        phone: pretty,
        whatsapp: pretty,
        origin: 'WHATSAPP',
        status: 'AWAITING_DISTRIBUTION',
        sourceDetail: referral?.headline
          ? `Anúncio: ${String(referral.headline).slice(0, 120)}`
          : referral?.source_id
            ? `Anúncio ${referral.source_id}`
            : 'Mensagem recebida via WhatsApp',
        adSourceId: referral?.source_id ? String(referral.source_id) : null,
        adHeadline: referral?.headline ? String(referral.headline) : null,
        ctwaClid: referral?.ctwa_clid ? String(referral.ctwa_clid) : null,
      },
    });
    return { lead, created: true };
  }

  private async applyStatus(st: any): Promise<void> {
    const waMessageId: string | undefined = st?.id;
    const raw: string | undefined = st?.status;
    if (!waMessageId || !raw) return;
    const map: Record<string, 'DELIVERED' | 'READ' | 'SENT' | 'FAILED'> = {
      delivered: 'DELIVERED',
      read: 'READ',
      sent: 'SENT',
      failed: 'FAILED',
    };
    const status = map[raw];
    if (!status) return;
    await this.platform.message.updateMany({
      where: { waMessageId },
      data: { status },
    });
  }
}
