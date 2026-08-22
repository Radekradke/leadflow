import * as argon2 from 'argon2';

/**
 * Parâmetros do Argon2id alinhados ao baseline da OWASP
 * (m=19 MiB, t=2, p=1). Pode-se elevar memoryCost/timeCost conforme o
 * hardware do servidor — quanto maior, mais caro é o ataque por força
 * bruta. NUNCA reduza abaixo deste piso.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
};

/** Gera o hash de uma senha em texto puro. O texto puro nunca é gravado. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/** Confere uma senha contra o hash armazenado. */
export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
