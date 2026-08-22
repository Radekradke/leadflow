/**
 * Validação de ambiente no BOOT — falha cedo e com mensagem clara, em vez
 * de quebrar de forma críptica em runtime (ex.: login que não funciona
 * porque faltou JWT_ACCESS_SECRET, ou cookies que não "colam" porque
 * FRONTEND_ORIGIN está vazio).
 */
const REQUIRED: [string, string][] = [
  ['DATABASE_URL', 'conexão do dono do banco (migrations/seed)'],
  ['APP_DATABASE_URL', 'conexão do papel de runtime leadflow_app (RLS)'],
  ['JWT_ACCESS_SECRET', 'segredo para assinar o token de acesso'],
  ['FRONTEND_ORIGIN', 'origem do frontend (CORS + cookies)'],
];

export function validateEnv(): void {
  const missing: string[] = [];
  for (const [key, desc] of REQUIRED) {
    if (!process.env[key]?.trim()) missing.push(`  - ${key}: ${desc}`);
  }

  // E-mail real exige credenciais.
  if ((process.env.MAIL_TRANSPORT ?? '').toLowerCase() === 'resend') {
    for (const key of ['RESEND_API_KEY', 'MAIL_FROM']) {
      if (!process.env[key]?.trim()) {
        missing.push(`  - ${key}: obrigatório quando MAIL_TRANSPORT=resend`);
      }
    }
  }

  if (missing.length) {
    throw new Error(
      `\n❌ Variáveis de ambiente faltando:\n${missing.join('\n')}\n\n` +
        `Defina-as (veja .env.example) e suba novamente.\n`,
    );
  }

  // Avisos: não bloqueiam o boot, mas importam em produção.
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (process.env.JWT_ACCESS_SECRET ?? '').length < 32) {
    console.warn(
      '⚠️  JWT_ACCESS_SECRET curto (< 32 chars). Use um segredo longo e aleatório em produção.',
    );
  }
  if (isProd && (process.env.MAIL_TRANSPORT ?? 'console').toLowerCase() === 'console') {
    console.warn(
      '⚠️  MAIL_TRANSPORT=console em produção — o e-mail de reset de senha não será enviado.',
    );
  }
}
