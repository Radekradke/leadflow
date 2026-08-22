import {
  KanbanSquare,
  Workflow,
  LayoutDashboard,
  Layers,
  ListChecks,
  LogOut,
  Settings,
  Users,
  MessageCircle,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABELS } from '../lib/types';

interface NavItem { to: string; label: string; icon: LucideIcon; permission?: string }

const NAV: NavItem[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users, permission: 'lead:read' },
  { to: '/atendimento', label: 'Atendimento', icon: MessageCircle, permission: 'whatsapp:read' },
  { to: '/kanban', label: 'Funil', icon: KanbanSquare, permission: 'lead:read' },
  { to: '/tasks', label: 'Tarefas', icon: ListChecks, permission: 'task:read' },
  { to: '/queues', label: 'Filas', icon: Layers, permission: 'queue:read' },
  { to: '/flows', label: 'Fluxos', icon: Workflow, permission: 'distribution:configure' },
  { to: '/admin', label: 'Admin', icon: Settings, permission: 'user:read' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Painel', '/leads': 'Leads', '/atendimento': 'Atendimento', '/kanban': 'Funil',
  '/tasks': 'Tarefas', '/queues': 'Filas', '/flows': 'Construtor de fluxo', '/admin': 'Administração',
};

function initials(n?: string) {
  if (!n) return 'U';
  return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = NAV.filter((i) => !i.permission || can(i.permission));
  const title = PAGE_TITLES[location.pathname] ?? '';
  const [moreOpen, setMoreOpen] = useState(false);
  // Barra inferior do mobile: até 5 itens cabem; acima disso, os últimos
  // vão para um menu "Mais" (senão Filas/Fluxos/Admin ficariam inacessíveis).
  const primary = items.length <= 5 ? items : items.slice(0, 4);
  const overflow = items.length <= 5 ? [] : items.slice(4);
  const overflowActive = overflow.some((i) => i.to === location.pathname);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-[244px] flex-shrink-0 flex-col bg-ink-900 text-white md:flex">
        <div className="flex items-center gap-2.5 px-5 py-[18px]">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-sm font-bold">L</div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">LeadFlow</div>
            <div className="text-2xs text-white/35">Imobiliário</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} strokeWidth={2} className={isActive ? 'text-accent' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
              {initials(user?.name ?? undefined)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name ?? 'Usuário'}</p>
              <p className="truncate text-2xs text-white/40">{user ? ROLE_LABELS[user.roleType] : ''}</p>
            </div>
            <button onClick={onLogout} className="btn-icon text-white/40 hover:bg-white/[0.06] hover:text-white" aria-label="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center border-b border-line bg-surface/80 px-8 py-4 backdrop-blur md:flex">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        </header>

        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">L</div>
            <span className="font-semibold tracking-tight">{title || 'LeadFlow'}</span>
          </div>
          <button onClick={onLogout} className="btn-icon" aria-label="Sair"><LogOut size={18} /></button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 pb-24 md:px-8 md:py-7 md:pb-8">
          <div className="animate-fade-in"><Outlet /></div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 backdrop-blur md:hidden"
          style={{ gridTemplateColumns: `repeat(${primary.length + (overflow.length ? 1 : 0)}, minmax(0,1fr))` }}
        >
          {primary.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-2xs ${isActive ? 'text-accent' : 'text-muted'}`
              }
            >
              <Icon size={20} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
          {overflow.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex flex-col items-center gap-1 py-2.5 text-2xs ${overflowActive ? 'text-accent' : 'text-muted'}`}
            >
              <MoreHorizontal size={20} strokeWidth={2} />
              Mais
            </button>
          )}
        </nav>

        {moreOpen && (
          <div className="fixed inset-0 z-40 md:hidden animate-fade-in" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-3 pb-9 shadow-pop animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 mt-1 h-1 w-10 rounded-full bg-line2" />
              <div className="grid grid-cols-3 gap-2">
                {overflow.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-2 rounded-2xl py-4 text-xs font-medium ${
                        isActive ? 'bg-accent-50 text-accent-700' : 'text-ink hover:bg-paper'
                      }`
                    }
                  >
                    <Icon size={22} strokeWidth={1.9} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
