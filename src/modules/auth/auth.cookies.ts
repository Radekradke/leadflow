import { CookieOptions, Response } from 'express';

const isProd = () => process.env.NODE_ENV === 'production';

const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15 min
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dias

type AuthCookies = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
};

/**
 * SameSite vem de COOKIE_SAMESITE (default "lax").
 *
 *  - "lax"  : use quando front e back são o MESMO site registrável
 *             (ex.: app.seudominio.com + api.seudominio.com). Mais seguro.
 *  - "none" : OBRIGATÓRIO quando front e back estão em domínios DIFERENTES
 *             (ex.: app.vercel.app + api.onrender.com). Exige Secure=true
 *             (HTTPS). A proteção CSRF NÃO fica enfraquecida porque o app
 *             também usa double-submit token (cookie csrf + header).
 *
 * Secure liga em produção; com SameSite=None liga sempre (o navegador
 * recusa "None" sem "Secure").
 */
function sameSite(): 'lax' | 'none' | 'strict' {
  const v = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  return v === 'none' ? 'none' : v === 'strict' ? 'strict' : 'lax';
}

function baseOptions(): Omit<CookieOptions, 'maxAge' | 'path' | 'httpOnly'> {
  const ss = sameSite();
  return {
    secure: isProd() || ss === 'none',
    sameSite: ss,
  };
}

/**
 * Grava os três cookies da sessão.
 *
 * - access_token  : httpOnly. O JS NUNCA lê — imune a roubo por XSS.
 * - refresh_token : httpOnly e com path '/auth' (só vai para as rotas de
 *   auth). IMPORTANTE: em produção o frontend deve chamar o backend
 *   DIRETO (VITE_API_URL = https://api.seudominio.com), sem prefixo /api,
 *   senão o path '/auth' não casa e o refresh não é enviado.
 * - csrf_token    : NÃO httpOnly de propósito — o frontend LÊ e reenvia no
 *   header X-CSRF-Token (double-submit).
 */
export function setAuthCookies(res: Response, tokens: AuthCookies): void {
  const base = baseOptions();

  res.cookie('access_token', tokens.accessToken, {
    ...base,
    httpOnly: true,
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  });

  res.cookie('refresh_token', tokens.refreshToken, {
    ...base,
    httpOnly: true,
    path: '/auth',
    maxAge: REFRESH_MAX_AGE,
  });

  res.cookie('csrf_token', tokens.csrfToken, {
    ...base,
    httpOnly: false, // o frontend LÊ este para reenviar no header
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/auth' });
  res.clearCookie('csrf_token', { path: '/' });
}
