import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../lib/api';
import { useZodForm } from '../lib/forms';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
});

export default function ForgotPasswordPage() {
  const form = useZodForm(schema, { email: '' });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    const data = form.validate();
    if (!data) return;
    setSubmitting(true);
    try {
      // Resposta é sempre genérica (anti-enumeração). Mostramos a mesma
      // tela de sucesso exista ou não a conta.
      await api.post('/auth/forgot-password', data);
    } catch {
      /* mesmo em erro de rede, não revelamos nada */
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-[360px]">
        <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> Voltar ao login
        </Link>

        {sent ? (
          <div className="animate-fade-in">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
              <MailCheck size={22} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Verifique seu e-mail</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Se houver uma conta com <span className="font-medium text-ink">{form.values.email}</span>,
              enviamos um link para redefinir a senha. O link expira em 30 minutos.
            </p>
            <Link to="/login" className="btn-ghost mt-6 w-full">Voltar ao login</Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold tracking-tight">Esqueceu a senha?</h2>
            <p className="mt-1 text-sm text-muted">Enviamos um link de redefinição para o seu e-mail.</p>
            <div className="mt-6">
              <label className="label" htmlFor="email">E-mail</label>
              <input
                id="email" type="email" autoComplete="username"
                className={`input ${form.errors.email ? 'input-error' : ''}`}
                value={form.values.email}
                onChange={(e) => form.set('email', e.target.value)}
                onBlur={() => form.blur('email')}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              />
              {form.errors.email && <p className="field-error">{form.errors.email}</p>}
            </div>
            <button className="btn-primary mt-6 w-full" disabled={submitting} onClick={onSubmit}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Enviar link de redefinição'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
