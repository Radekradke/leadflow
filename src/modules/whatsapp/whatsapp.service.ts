import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { canSeeContact, maskPhone } from '../leads/lead.masking';
import { leadScopeWhere } from '../leads/lead.scope';
import { decryptSecret, encryptSecret } from './whatsapp.crypto';
import { SendMessageDto, SetAccountDto } from './dto/whatsapp.dto';

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_API_VERSION ?? 'v21.0'}`;

/**
 * Serviço do WhatsApp voltado à APLICAÇÃO (inbox do corretor/gestor).
 * Usa o cliente com RLS (this.prisma.client), então tudo já fica isolado
 * por tenant; o escopo por papel (corretor vê só os dele) vem do
 * leadScopeWhere.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  // Modo simulação: quando WHATSAPP_DEV_MODE=true, o envio NÃO chama a Meta
  // (registra como enviado), permitindo testar o fluxo capturar→responder
  // sem credenciais reais. Desligue em produção.
  private readonly devMode = process.env.WHATSAPP_DEV_MODE === 'true';
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin: configurar credenciais (token guardado criptografado) ──
  async setAccount(user: AuthenticatedUser, dto: SetAccountDto) {
    const data = {
      phoneNumberId: dto.phoneNumberId,
      wabaId: dto.wabaId ?? null,
      displayNumber: dto.displayNumber ?? null,
      accessTokenEnc: encryptSecret(dto.accessToken),
      // Coluna NOT NULL no schema. A verificação do webhook usa o token
      // GLOBAL do app (WHATSAPP_WEBHOOK_VERIFY_TOKEN), então aqui basta um
      // valor vazio quando o admin não informa um por tenant. Gravar null
      // invalidava o upsert inteiro (PrismaClientValidationError -> 500).
      verifyToken: dto.verifyToken ?? '',
      appSecretEnc: dto.appSecret ? encryptSecret(dto.appSecret) : null,
      defaultQueueId: dto.defaultQueueId || null,
      active: true,
    };
    const acc = await this.prisma.client.whatsAppAccount.upsert({
      where: { tenantId: user.tenantId },
      create: { tenantId: user.tenantId, ...data },
      update: data,
    });
    return this.publicAccount(acc);
  }

  async getAccount(user: AuthenticatedUser) {
    const acc = await this.prisma.client.whatsAppAccount.findUnique({
      where: { tenantId: user.tenantId },
    });
    if (acc) return this.publicAccount(acc);
    if (this.devMode) {
      return { configured: true, dev: true, displayNumber: 'Número de simulação (dev)', active: true };
    }
    return { configured: false };
  }

  /** Nunca devolve token/secret — só o que a UI precisa. */
  private publicAccount(acc: {
    id: string;
    phoneNumberId: string;
    wabaId: string | null;
    displayNumber: string | null;
    defaultQueueId: string | null;
    active: boolean;
    createdAt: Date;
  }) {
    return {
      configured: true,
      id: acc.id,
      phoneNumberId: acc.phoneNumberId,
      wabaId: acc.wabaId,
      displayNumber: acc.displayNumber,
      defaultQueueId: acc.defaultQueueId,
      active: acc.active,
      createdAt: acc.createdAt,
    };
  }

  // ── Inbox: conversas (escopadas por papel) ──
  async listConversations(user: AuthenticatedUser) {
    const showContact = canSeeContact(user);
    const convs = await this.prisma.client.conversation.findMany({
      where: { lead: leadScopeWhere(user) },
      orderBy: [{ lastMessageAt: 'desc' }],
      take: 100,
      include: { lead: { select: { id: true, name: true, status: true } } },
    });
    return convs.map((c) => ({
      id: c.id,
      leadId: c.leadId,
      leadName: c.lead?.name ?? 'Contato',
      leadStatus: c.lead?.status ?? null,
      waPhone: showContact ? c.waPhone : maskPhone(c.waPhone),
      lastMessageAt: c.lastMessageAt,
      lastMessageText: c.lastMessageText,
      unreadCount: c.unreadCount,
      windowExpiresAt: c.windowExpiresAt,
    }));
  }

  // ── Inbox: mensagens de uma conversa (marca como lida) ──
  async getMessages(user: AuthenticatedUser, conversationId: string) {
    const conv = await this.findScopedConversation(user, conversationId);
    const msgs = await this.prisma.client.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    if (conv.unreadCount > 0) {
      await this.prisma.client.conversation.update({
        where: { id: conv.id },
        data: { unreadCount: 0 },
      });
    }
    return msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      status: m.status,
      createdAt: m.createdAt,
    }));
  }

  // ── Enviar mensagem (Graph API + persistência) ──
  async sendMessage(user: AuthenticatedUser, conversationId: string, dto: SendMessageDto) {
    const conv = await this.findScopedConversation(user, conversationId);
    const acc = await this.prisma.client.whatsAppAccount.findUnique({
      where: { tenantId: user.tenantId },
    });

    let waMessageId: string | null = null;
    let status: 'SENT' | 'FAILED' = 'SENT';
    let outsideWindow = false;

    if (this.devMode) {
      // Simulação: não chama a Meta; registra como enviada para você ver a
      // resposta aparecer na conversa.
      waMessageId = 'sim-out-' + Date.now();
    } else {
      if (!acc || !acc.active) {
        throw new BadRequestException('WhatsApp não configurado para este tenant.');
      }
      // Janela de 24h: fora dela a Meta exige TEMPLATE. Este MVP envia texto
      // livre; fora da janela a Meta rejeita e a mensagem fica FAILED.
      outsideWindow = conv.windowExpiresAt ? conv.windowExpiresAt.getTime() < Date.now() : true;
      const token = decryptSecret(acc.accessTokenEnc);
      try {
        const res = await fetch(`${GRAPH}/${acc.phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: conv.waPhone,
            type: 'text',
            text: { preview_url: false, body: dto.body },
          }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          status = 'FAILED';
          this.logger.error(`Envio falhou (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
        } else {
          waMessageId = data?.messages?.[0]?.id ?? null;
        }
      } catch (err) {
        status = 'FAILED';
        this.logger.error(`Erro ao chamar Graph API: ${(err as Error).message}`);
      }
    }

    const msg = await this.prisma.client.message.create({
      data: {
        tenantId: user.tenantId,
        conversationId: conv.id,
        direction: 'OUTBOUND',
        waMessageId,
        body: dto.body,
        status,
        sentByUserId: user.id,
      },
    });
    await this.prisma.client.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: new Date(), lastMessageText: dto.body },
    });

    return {
      id: msg.id,
      direction: 'OUTBOUND' as const,
      body: msg.body,
      status: msg.status,
      createdAt: msg.createdAt,
      outsideWindow,
    };
  }

  /** Carrega a conversa SÓ se ela está dentro do escopo do usuário. */
  private async findScopedConversation(user: AuthenticatedUser, id: string) {
    const conv = await this.prisma.client.conversation.findFirst({
      where: { id, lead: leadScopeWhere(user) },
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    return conv;
  }
}
