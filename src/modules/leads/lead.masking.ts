import { Lead } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';

/** Pode ver dados de SIMULAÇÃO completos (CPF, renda, entrada). */
export function canSeeSensitive(user: AuthenticatedUser): boolean {
  return user.permissions.includes('lead:read_sensitive');
}

/** Pode ver o CONTATO direto (telefone/WhatsApp) sem máscara. */
export function canSeeContact(user: AuthenticatedUser): boolean {
  return user.permissions.includes('lead:read_contact');
}

/** CPF mascarado: ***.***.**-NN (só os 2 últimos dígitos). */
export function maskCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return '***';
  return `***.***.**-${d.slice(9)}`;
}

/** Telefone mascarado: mantém DDD e os 2 últimos dígitos. Ex.: (21) *****-**45 */
export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length < 4) return '****';
  const ddd = d.length >= 10 ? d.slice(0, 2) : '';
  return `${ddd ? `(${ddd}) ` : ''}*****-**${d.slice(-2)}`;
}

/**
 * Prepara o lead para a resposta da API com DUAS proteções independentes:
 *
 *  - SIMULAÇÃO  (canSensitive → lead:read_sensitive): CPF, renda e entrada.
 *    Quem faz simulação de financiamento PRECISA do CPF — por isso a maioria
 *    dos perfis operacionais (inclusive o corretor) tem esta permissão.
 *
 *  - CONTATO    (canContact → lead:read_contact): telefone e WhatsApp.
 *    Mascarado para quem NÃO deve tirar o lead do sistema (ex.: corretor),
 *    que então atende pelo chat interno. Evita o "roubo" do lead para o
 *    WhatsApp pessoal e mantém o histórico dentro da plataforma.
 *
 * Estas duas dimensões são ORTOGONAIS: dá para ver CPF e não ver telefone
 * (caso do corretor) e vice-versa.
 */
export function serializeLead(
  lead: Lead,
  canSensitive: boolean,
  canContact: boolean,
) {
  return {
    ...lead,
    cpf: canSensitive ? lead.cpf : maskCpf(lead.cpf),
    familyIncome:
      canSensitive && lead.familyIncome ? lead.familyIncome.toString() : null,
    downPaymentAvailable:
      canSensitive && lead.downPaymentAvailable
        ? lead.downPaymentAvailable.toString()
        : null,
    phone: canContact ? lead.phone : maskPhone(lead.phone),
    whatsapp: canContact ? lead.whatsapp : maskPhone(lead.whatsapp),
  };
}
