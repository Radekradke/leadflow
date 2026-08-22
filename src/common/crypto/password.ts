import * as argon2 from 'argon2';

/**
 * Hash e verificação de senha com Argon2id (resistente a ataque por
 * GPU/ASIC, vencedor da Password Hashing Competition).
 *
 * São funções PURAS — sem dependência do Nest — de propósito: assim o
 * seed (script standalone) e o módulo de auth usam exatamente a mesma
 * implementação, sem duplicar regra de segurança.
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    // Os parâmetros padrão do argon2 já são sólidos. Se um dia o login
    // ficar lento no hardware de produção, meça e ajuste memoryCost /
    // timeCost aqui — nunca enfraqueça para "ganhar velocidade" sem medir.
  });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
