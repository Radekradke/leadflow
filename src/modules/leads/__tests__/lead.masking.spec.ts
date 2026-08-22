import { canSeeContact, canSeeSensitive, maskCpf, maskPhone, serializeLead } from '../lead.masking';
import type { AuthenticatedUser } from '../../auth/auth.types';

const user = (perms: string[]): AuthenticatedUser => ({
  id: 'u1', tenantId: 't1', teamId: null, roleType: 'BROKER', permissions: perms,
});

const fakeLead = (over: Partial<any> = {}): any => ({
  id: 'l1', tenantId: 't1', name: 'Ana',
  phone: '21999990045', whatsapp: '21999990045',
  cpf: '12345678909', familyIncome: null, downPaymentAvailable: null,
  status: 'NEW', origin: 'WEBSITE', ...over,
});

describe('maskCpf', () => {
  it('mostra só os 2 últimos dígitos', () => {
    expect(maskCpf('12345678909')).toBe('***.***.**-09');
  });
  it('lida com nulo e formato inválido', () => {
    expect(maskCpf(null)).toBeNull();
    expect(maskCpf('123')).toBe('***');
  });
});

describe('maskPhone', () => {
  it('mantém DDD e os 2 últimos', () => {
    expect(maskPhone('21999990045')).toBe('(21) *****-**45');
  });
  it('lida com nulo', () => {
    expect(maskPhone(null)).toBeNull();
  });
});

describe('serializeLead — CPF e telefone são ortogonais', () => {
  it('CORRETOR (read_sensitive, SEM read_contact): vê CPF, telefone mascarado', () => {
    const out = serializeLead(fakeLead(), true, false);
    expect(out.cpf).toBe('12345678909');           // CPF cru p/ simulação
    expect(out.phone).toBe('(21) *****-**45');      // telefone mascarado
    expect(out.whatsapp).toBe('(21) *****-**45');
  });

  it('GESTOR (ambas): vê tudo cru', () => {
    const out = serializeLead(fakeLead(), true, true);
    expect(out.cpf).toBe('12345678909');
    expect(out.phone).toBe('21999990045');
  });

  it('VISUALIZADOR (nenhuma): tudo mascarado', () => {
    const out = serializeLead(fakeLead(), false, false);
    expect(out.cpf).toBe('***.***.**-09');
    expect(out.phone).toBe('(21) *****-**45');
  });
});

describe('helpers de permissão', () => {
  it('canSeeSensitive lê lead:read_sensitive', () => {
    expect(canSeeSensitive(user(['lead:read_sensitive']))).toBe(true);
    expect(canSeeSensitive(user([]))).toBe(false);
  });
  it('canSeeContact lê lead:read_contact', () => {
    expect(canSeeContact(user(['lead:read_contact']))).toBe(true);
    expect(canSeeContact(user(['lead:read_sensitive']))).toBe(false);
  });
});
