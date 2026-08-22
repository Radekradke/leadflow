import { Injectable, Logger } from '@nestjs/common';

/**
 * Envio de e-mail com transporte selecionável por env (MAIL_TRANSPORT):
 *
 *  - "console" (default, dev): imprime o link no log do servidor.
 *  - "resend"  (produção): envia de verdade via API da Resend (HTTP, sem
 *    SDK — usa o fetch nativo do Node 20). Precisa de RESEND_API_KEY e
 *    MAIL_FROM (um remetente de domínio verificado na Resend).
 *
 * Trocar de provedor é mexer só aqui; quem chama (PasswordResetService)
 * não muda.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport = (process.env.MAIL_TRANSPORT ?? 'console').toLowerCase();
  private readonly isProd = process.env.NODE_ENV === 'production';
  private readonly from = process.env.MAIL_FROM ?? 'LeadFlow <no-reply@example.com>';

  async sendPasswordReset(to: string, resetLink: string): Promise<void> {
    const subject = 'Redefinição de senha — LeadFlow';
    const html = passwordResetHtml(resetLink);
    const text = `Para redefinir sua senha, acesse: ${resetLink}\nO link expira em 30 minutos. Se não foi você, ignore este e-mail.`;
    await this.send(to, subject, html, text);
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<void> {
    if (this.transport === 'resend') {
      return this.sendViaResend(to, subject, html, text);
    }
    // console
    if (this.isProd) {
      this.logger.warn(
        'MAIL_TRANSPORT=console em produção — e-mail NÃO enviado. Configure MAIL_TRANSPORT=resend.',
      );
      return;
    }
    this.logger.log(`\n📧  [DEV] Para ${to} — ${subject}\n    ${text.split('\n')[1] ?? text}\n`);
  }

  private async sendViaResend(to: string, subject: string, html: string, text: string): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.error('RESEND_API_KEY ausente — e-mail não enviado.');
      return; // não vaza erro pro fluxo de reset (anti-enumeração)
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to, subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`Resend respondeu ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      this.logger.error(`Falha ao chamar Resend: ${(err as Error).message}`);
    }
  }
}

function passwordResetHtml(link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:Segoe UI,Arial,sans-serif;color:#15181e">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:24px">
      <div style="width:32px;height:32px;border-radius:9px;background:#0E7C66;color:#fff;text-align:center;line-height:32px;font-weight:700">L</div>
      <strong style="font-size:16px">LeadFlow</strong>
    </div>
    <h1 style="font-size:20px;margin:0 0 12px">Redefinição de senha</h1>
    <p style="font-size:14px;line-height:1.6;color:#5a6473;margin:0 0 24px">
      Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo.
      O link expira em <strong>30 minutos</strong>.
    </p>
    <a href="${link}" style="display:inline-block;background:#0E7C66;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px">Redefinir minha senha</a>
    <p style="font-size:12px;line-height:1.6;color:#9aa1ad;margin:24px 0 0">
      Se você não solicitou isso, pode ignorar este e-mail com segurança — sua senha continua a mesma.
    </p>
  </div></body></html>`;
}
