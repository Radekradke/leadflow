import { ALL_PERMISSION_KEYS, permissionsForRole } from '../permissions';

describe('permissionsForRole', () => {
  it('ADMIN recebe TODAS as permissões', () => {
    expect(permissionsForRole('ADMIN').sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('CORRETOR vê CPF (read_sensitive) mas NÃO o telefone (read_contact)', () => {
    const p = permissionsForRole('BROKER');
    expect(p).toContain('lead:read_sensitive');
    expect(p).not.toContain('lead:read_contact');
  });

  it('GESTOR e COORDENADOR veem CPF e telefone', () => {
    for (const role of ['SALES_MANAGER', 'COORDINATOR'] as const) {
      const p = permissionsForRole(role);
      expect(p).toContain('lead:read_sensitive');
      expect(p).toContain('lead:read_contact');
    }
  });

  it('SUPERVISOR DE FILA vê telefone mas não CPF', () => {
    const p = permissionsForRole('QUEUE_SUPERVISOR');
    expect(p).toContain('lead:read_contact');
    expect(p).not.toContain('lead:read_sensitive');
  });

  it('VISUALIZADOR não vê nem CPF nem telefone, e não cria/edita', () => {
    const p = permissionsForRole('VIEWER');
    expect(p).not.toContain('lead:read_sensitive');
    expect(p).not.toContain('lead:read_contact');
    expect(p).not.toContain('lead:create');
    expect(p).not.toContain('lead:update');
  });

  it('só o ADMIN cria usuários', () => {
    for (const role of ['SALES_MANAGER','COORDINATOR','BROKER','ATTENDANT','QUEUE_SUPERVISOR','VIEWER'] as const) {
      expect(permissionsForRole(role)).not.toContain('user:create');
    }
  });
});
