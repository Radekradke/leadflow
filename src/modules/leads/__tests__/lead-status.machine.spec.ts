import { allowedTransitions, canTransition, reasonRequired } from '../lead-status.machine';

describe('máquina de status do lead', () => {
  it('exige motivo para LOST e ARCHIVED', () => {
    expect(reasonRequired('LOST')).toBe(true);
    expect(reasonRequired('ARCHIVED')).toBe(true);
    expect(reasonRequired('IN_SERVICE')).toBe(false);
  });

  it('allowedTransitions é coerente com canTransition', () => {
    const from = 'IN_SERVICE' as const;
    for (const to of allowedTransitions(from)) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('não permite transição inventada', () => {
    expect(canTransition('RESOLVED', 'NEW')).toBe(false);
  });
});
