import { createHash, randomBytes } from 'node:crypto';

/**
 * Gera um token opaco aleatório (base64url). Usado para refresh token e
 * para o token CSRF. base64url é seguro para cookies/headers/URLs.
 */
export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * sha256 do token. Guardamos SÓ o hash no banco — se o banco vazar, os
 * refresh tokens não são reutilizáveis. (Não precisa de Argon2 aqui: o
 * token já é aleatório e longo, não é uma senha humana.)
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
