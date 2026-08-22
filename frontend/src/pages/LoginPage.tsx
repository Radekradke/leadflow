import { ArrowRight, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full">
      {/* Marca */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{ background: 'radial-gradient(110% 60% at 15% 0%, rgba(14,124,102,0.22), transparent 60%)' }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-bold">L</div>
          <span className="text-lg font-semibold tracking-tight">LeadFlow</span>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-[2rem] font-semibold leading-[1.15] tracking-tight">
            O lead certo, no corretor certo, na hora certa.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">
            Distribuição automática, transferência rastreada e visão clara da operação — do
            primeiro contato à venda.
          </p>
          <div className="mt-8 flex gap-6 text-2xs text-white/40">
            <div><div className="font-mono text-base text-white/80">RLS</div>isolamento por tenant</div>
            <div><div className="font-mono text-base text-white/80">Argon2id</div>senhas protegidas</div>
            <div><div className="font-mono text-base text-white/80">LGPD</div>CPF mascarado</div>
          </div>
        </div>
        <p className="relative font-mono text-2xs text-white/25">LeadFlow Imobiliário · acesso restrito</p>
      </div>

      {/* Formulário */}
      <div className="flex w-full items-center justify-center p-6 lg:w-[54%]">
        <form onSubmit={onSubmit} className="w-full max-w-[340px]">
          <div className="mb-8 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-bold text-white">L</div>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Bem-vindo de volta</h2>
          <p className="mt-1 text-sm text-muted">Acesse o painel da sua operação.</p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 animate-fade-in">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0" htmlFor="password">Senha</label>
                <Link to="/forgot-password" className="text-xs font-medium text-accent hover:text-accent-600">Esqueci a senha</Link>
              </div>
              <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          <button type="submit" className="btn-primary mt-6 w-full" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <>Entrar <ArrowRight size={16} /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
