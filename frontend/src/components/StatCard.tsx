import type { LucideIcon } from 'lucide-react';

type Tone = 'default' | 'warn' | 'good';
const toneText: Record<Tone, string> = {
  default: 'text-ink', warn: 'text-amber-700', good: 'text-accent-600',
};
const toneIcon: Record<Tone, string> = {
  default: 'bg-paper text-muted', warn: 'bg-amber-50 text-amber-600', good: 'bg-accent-50 text-accent-600',
};

export default function StatCard({
  label, value, hint, tone = 'default', icon: Icon,
}: { label: string; value: string | number; hint?: string; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-2xs font-semibold uppercase tracking-[0.05em] text-muted">{label}</p>
        {Icon && (
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneIcon[tone]}`}>
            <Icon size={15} strokeWidth={2} />
          </span>
        )}
      </div>
      <p className={`mt-2 font-mono text-[1.7rem] font-semibold leading-none tracking-tight ${toneText[tone]}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
