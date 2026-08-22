import { LEAD_STATUS_META, type LeadStatus } from '../lib/types';

export default function StatusPill({ status }: { status: LeadStatus }) {
  const m = LEAD_STATUS_META[status];
  return <span className={`pill pill-dot ${m.className}`}>{m.label}</span>;
}
