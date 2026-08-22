import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../lib/api';
import { api } from '../lib/api';
import { passwordPolicy, useZodForm } from '../lib/forms';

const schema = z
  .object({
    password: passwordPolicy,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'As senhas não coincidem',
    path: ['confirm'],
  });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const form = useZodForm(schema, { password: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Centered>
        <h2 className="text-xl font-semibold tracking-tight">Link inválido</h2>
        <p className="mt-2 text-sm text-muted">Este link de redefinição está incompleto ou expirou.</p>
        <Link to="/forgot-password" className="btn-primary mt-6 w-full">Solicitar novo link</Link>
      </Centered>
    );
  }

  async function onSubmit() {
    const data = form.validate();
    if (!data) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2200);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível redefinir. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Centered>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
          <CheckCircle2 size={22} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Senha redefinida</h2>
        <p className="mt-2 text-sm text-muted">Tudo certo! Redirecionando para o login…</p>
      </Centered>
    );
  }

  return (
    <Centered>
      <h2 className="text-xl font-semibold tracking-tight">Nova senha</h2>
      <p className="mt-1 text-sm text-muted">Escolha uma senha forte. Suas sessões abertas serão encerradas.</p>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        <label className="label">Nova senha</label>
        <input
          type="password" autoComplete="new-password"
          className={`input ${form.errors.password ? 'input-error' : ''}`}
          value={form.values.password}
          onChange={(e) => form.set('password', e.target.value)}
          onBlur={() => form.blur('password')}
        />
        {form.errors.password
          ? <p className="field-error">{form.errors.password}</p>
          : <p className="mt-1 text-xs text-muted">Mín. 8 caracteres, com letra e número.</p>}
      </div>
      <div className="mt-4">
        <label className="label">Confirmar senha</label>
        <input
          type="password" autoComplete="new-password"
          className={`input ${form.errors.confirm ? 'input-error' : ''}`}
          value={form.values.confirm}
          onChange={(e) => form.set('confirm', e.target.value)}
          onBlur={() => form.blur('confirm')}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        />
        {form.errors.confirm && <p className="field-error">{form.errors.confirm}</p>}
      </div>

      <button className="btn-primary mt-6 w-full" disabled={submitting || !form.isValid} onClick={onSubmit}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Redefinir senha'}
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-[360px] animate-fade-in">{children}</div>
    </div>
  );
}
