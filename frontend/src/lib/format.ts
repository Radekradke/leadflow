const DAY = 86_400_000;
export function relDate(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 30) return `${diff} dias atrás`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
export function dateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
export function brl(v?: string | number | null): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
