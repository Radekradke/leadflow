import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Valida a assinatura do webhook da Meta. O corpo CRU é assinado com
 * HMAC-SHA256(appSecret, rawBody) e enviado no header:
 *   X-Hub-Signature-256: sha256=<hex>
 * Comparação em tempo constante (timingSafeEqual) contra timing attacks.
 */
export function verifySignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  let a: Buffer, b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(received, 'hex');
  } catch {
    return false;
  }
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** Normaliza um telefone para só dígitos (E.164 sem o '+'). */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}
