import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Criptografia simétrica AES-256-GCM para segredos do WhatsApp (token da
 * Graph API e app secret). Nunca guardamos esses valores em texto puro.
 *
 * Chave em WHATSAPP_ENC_KEY: 32 bytes, em hex (64 chars) ou base64.
 * Gere uma com:  openssl rand -hex 32
 */
function key(): Buffer {
  const raw = (process.env.WHATSAPP_ENC_KEY ?? '').trim();
  const buf =
    raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      'WHATSAPP_ENC_KEY inválida: precisa de 32 bytes (hex de 64 chars ou base64). Gere com: openssl rand -hex 32',
    );
  }
  return buf;
}

/** Formato de saída: iv:authTag:ciphertext, cada parte em base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string): string {
  const [ivB64, tagB64, ctB64] = enc.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Segredo criptografado em formato inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
