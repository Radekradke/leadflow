// Cliente HTTP único do app. Regras de segurança que ele garante:
//  - SEMPRE envia cookies (credentials: 'include') — o token de acesso é
//    httpOnly, então o JS nunca o toca. Nada de token no localStorage.
//  - Em mutações (POST/PATCH/PUT/DELETE) injeta o header X-CSRF-Token lido
//    do cookie csrf_token (double-submit). O backend compara os dois.
//  - 401 dispara um evento global p/ o AuthProvider derrubar a sessão.

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const UNAUTHORIZED_EVENT = 'leadflow:unauthorized';

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

// Em produção (front na Vercel, API no Render) o cookie csrf_token pertence
// ao domínio da API e o JS daqui NÃO consegue lê-lo. O backend devolve o
// mesmo valor no corpo do login/refresh; guardamos e reenviamos no header.
// localStorage sobrevive ao reload; o fallback readCookie cobre o dev
// same-origin (proxy /api do Vite).
const CSRF_STORAGE_KEY = 'leadflow.csrf';
let csrfToken: string | null = localStorage.getItem(CSRF_STORAGE_KEY);

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
  if (token) localStorage.setItem(CSRF_STORAGE_KEY, token);
  else localStorage.removeItem(CSRF_STORAGE_KEY);
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (MUTATING.has(method)) {
    const csrf = csrfToken ?? readCookie('csrf_token');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(401, 'Sessão expirada');
  }

  const isJson = res.headers
    .get('content-type')
    ?.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      (isJson && (payload as { message?: string })?.message) ||
      `Erro ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
