import { useState } from 'react';
import { z } from 'zod';

/**
 * Espelha a política de senha do backend (passwordPolicy). Mantenha as
 * duas em sincronia — a validação do servidor é a que MANDA; esta aqui é
 * só para dar feedback imediato ao usuário antes do envio.
 */
export const passwordPolicy = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .max(128, 'Máximo de 128 caracteres')
  .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
  .regex(/[0-9]/, 'Inclua ao menos um número');

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Validação de formulário leve, sem dependências de UI. Valida com um
 * schema Zod e devolve erros por campo. Não tenta ser um react-hook-form
 * — é só o suficiente para feedback inline limpo.
 *
 * Uso:
 *   const form = useZodForm(schema, { name: '', email: '' });
 *   ...
 *   <input value={form.values.name} onChange={(e)=>form.set('name', e.target.value)} />
 *   {form.errors.name && <p className="err">{form.errors.name}</p>}
 *   ...
 *   if (form.validate()) enviar(form.values);
 */
export function useZodForm<S extends z.ZodTypeAny>(
  schema: S,
  initial: z.input<S>,
) {
  type V = z.input<S>;
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FieldErrors<V>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({});

  function runValidation(): { ok: boolean; data?: z.output<S>; errs: FieldErrors<V> } {
    const result = schema.safeParse(values);
    if (result.success) return { ok: true, data: result.data, errs: {} };
    const errs: FieldErrors<V> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof V | undefined;
      if (key && !errs[key]) errs[key] = issue.message;
    }
    return { ok: false, errs };
  }

  function set<K extends keyof V>(key: K, value: V[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    // Revalida o campo só depois que ele já foi "tocado" — evita gritar
    // erro enquanto a pessoa ainda está digitando o primeiro caractere.
    if (touched[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        const single = schema.safeParse({ ...values, [key]: value });
        if (single.success) {
          delete next[key];
        } else {
          const issue = single.error.issues.find((i) => i.path[0] === key);
          if (issue) next[key] = issue.message;
          else delete next[key];
        }
        return next;
      });
    }
  }

  function blur<K extends keyof V>(key: K) {
    setTouched((t) => ({ ...t, [key]: true }));
    const { errs } = runValidation();
    setErrors((prev) => ({ ...prev, [key]: errs[key] }));
  }

  /** Valida tudo. Retorna os dados parseados se válido, senão null. */
  function validate(): z.output<S> | null {
    const { ok, data, errs } = runValidation();
    if (!ok) {
      setErrors(errs);
      setTouched(
        Object.keys(values as object).reduce(
          (acc, k) => ({ ...acc, [k]: true }),
          {} as Partial<Record<keyof V, boolean>>,
        ),
      );
      return null;
    }
    return data!;
  }

  function reset(next?: V) {
    setValues(next ?? initial);
    setErrors({});
    setTouched({});
  }

  const isValid = runValidation().ok;

  return { values, errors, set, blur, validate, reset, isValid, setValues };
}
