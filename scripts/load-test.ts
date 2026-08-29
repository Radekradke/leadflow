/* eslint-disable no-console */
import autocannon from 'autocannon';
import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Teste de carga do milestone 1: "50 usuários simultâneos num dia cheio,
 * sem gargalo" + "rajada de webhook do WhatsApp não pode perder lead".
 *
 * Duas fases:
 *  1) 50 conexões batendo em endpoints reais autenticados (lista de leads,
 *     dashboard) por alguns segundos — mede p50/p95/p99 e taxa de erro.
 *  2) Rajada de N webhooks assinados da Meta em paralelo — mede quão rápido
 *     cada um é ACEITO (só grava na fila, não processa mais na resposta) e
 *     confere, no fim, que TODOS viraram lead (nenhum se perdeu).
 *
 * Uso: npm run load-test  (servidor precisa estar rodando em BASE_URL)
 */

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@demo.local';
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'troque-por-uma-senha-forte';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const PHONE_NUMBER_ID = process.env.LOAD_TEST_PHONE_NUMBER_ID ?? '999888777';
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 50);
const DURATION_S = Number(process.env.LOAD_TEST_DURATION_S ?? 15);
const WEBHOOK_BURST = Number(process.env.LOAD_TEST_WEBHOOK_BURST ?? 50);

type LoginResult = { cookie: string; csrfToken: string };

async function login(): Promise<LoginResult> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login falhou: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { csrfToken: string };
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Login não devolveu cookies de sessão.');
  return { cookie, csrfToken: body.csrfToken };
}

/** Fase 1: carga concorrente em endpoints autenticados de leitura. */
async function runHttpLoad(auth: LoginResult) {
  console.log(`\n== Fase 1: ${CONNECTIONS} conexões simultâneas por ${DURATION_S}s ==`);
  const result = await autocannon({
    url: BASE_URL,
    connections: CONNECTIONS,
    duration: DURATION_S,
    headers: { cookie: auth.cookie },
    requests: [
      { method: 'GET', path: '/leads' },
      { method: 'GET', path: '/dashboard/operational' },
      { method: 'GET', path: '/queues' },
    ],
  });
  console.log(`Requisições: ${result.requests.total} | Erros: ${result.errors} | Timeouts: ${result.timeouts}`);
  console.log(
    `Latência (ms) — p50: ${result.latency.p50} | p95: ${result.latency.p97_5} | p99: ${result.latency.p99} | max: ${result.latency.max}`,
  );
  console.log(`Throughput médio: ${result.requests.average.toFixed(1)} req/s`);
  return result;
}

function signPayload(payload: unknown): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  const signature = 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
  return { body, signature };
}

function makeWebhookPayload(waMessageId: string, fromDigits: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ profile: { name: `Carga ${waMessageId}` } }],
              messages: [
                {
                  id: waMessageId,
                  from: fromDigits,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Quero saber sobre o apartamento (teste de carga)' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** Fase 2: rajada de webhooks — mede latência de ACEITE (não de processamento). */
async function runWebhookBurst() {
  console.log(`\n== Fase 2: rajada de ${WEBHOOK_BURST} webhooks simultâneos ==`);
  if (!APP_SECRET) {
    console.log('WHATSAPP_APP_SECRET vazio — pulando fase 2 (sem como assinar).');
    return { ids: [] as string[] };
  }
  const runId = Date.now();
  const ids: string[] = [];
  const start = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: WEBHOOK_BURST }, (_, i) => {
      const waMessageId = `wamid.LOADTEST-${runId}-${i}`;
      const fromDigits = `55219999${String(i).padStart(5, '0')}`;
      ids.push(waMessageId);
      const { body, signature } = signPayload(makeWebhookPayload(waMessageId, fromDigits));
      return fetch(`${BASE_URL}/whatsapp/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
        body,
      });
    }),
  );
  const elapsedMs = performance.now() - start;
  const ok = results.filter((r) => r.status === 'fulfilled' && (r.value as Response).ok).length;
  const failed = WEBHOOK_BURST - ok;
  console.log(
    `${ok}/${WEBHOOK_BURST} aceitos (200) em ${elapsedMs.toFixed(0)}ms — ${(elapsedMs / WEBHOOK_BURST).toFixed(1)}ms/req em média. Falhas: ${failed}`,
  );
  return { ids };
}

/** Espera a fila esvaziar (worker processando) e confere que nenhum lead sumiu. */
async function verifyNoLeadLost(ids: string[]) {
  if (ids.length === 0) return;
  console.log(`\n== Verificação: nenhum lead perdido? ==`);
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const deadline = Date.now() + 30_000;
    let remaining = ids.length;
    while (Date.now() < deadline) {
      const count = await prisma.message.count({ where: { waMessageId: { in: ids } } });
      remaining = ids.length - count;
      if (remaining === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (remaining === 0) {
      console.log(`✔ Todas as ${ids.length} mensagens da rajada viraram Message/Lead no banco.`);
    } else {
      console.log(`✘ Faltaram ${remaining}/${ids.length} — investigar antes de considerar aprovado.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const auth = await login();
  await runHttpLoad(auth);
  const { ids } = await runWebhookBurst();
  await verifyNoLeadLost(ids);
}

main().catch((err) => {
  console.error('Teste de carga falhou:', err);
  process.exit(1);
});
