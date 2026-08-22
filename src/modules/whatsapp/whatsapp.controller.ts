import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  SendMessageDto,
  SetAccountDto,
  SimulateInboundDto,
  sendMessageSchema,
  setAccountSchema,
  simulateInboundSchema,
} from './dto/whatsapp.dto';
import { WhatsAppInboundService } from './whatsapp.inbound.service';
import { WhatsAppService } from './whatsapp.service';

/** Endpoints autenticados do WhatsApp (inbox + configuração). */
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly wa: WhatsAppService,
    private readonly inbound: WhatsAppInboundService,
  ) {}

  @RequirePermissions('whatsapp:configure')
  @Get('account')
  getAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.wa.getAccount(user);
  }

  @RequirePermissions('whatsapp:configure')
  @Post('account')
  setAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(setAccountSchema)) dto: SetAccountDto,
  ) {
    return this.wa.setAccount(user, dto);
  }

  @RequirePermissions('whatsapp:read')
  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.wa.listConversations(user);
  }

  @RequirePermissions('whatsapp:read')
  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.wa.getMessages(user, id);
  }

  @RequirePermissions('whatsapp:send')
  @Post('conversations/:id/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.wa.sendMessage(user, id, dto);
  }

  // Simulação de lead recebido — só funciona com WHATSAPP_DEV_MODE=true.
  // Serve para testar/demonstrar o fluxo capturar→responder sem a Meta.
  @RequirePermissions('whatsapp:configure')
  @Post('dev/simulate-inbound')
  async simulateInbound(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(simulateInboundSchema)) dto: SimulateInboundDto,
  ) {
    if (process.env.WHATSAPP_DEV_MODE !== 'true') {
      throw new ForbiddenException('Modo simulação desativado.');
    }
    await this.inbound.simulateInbound(user.tenantId, dto);
    return { ok: true };
  }
}
