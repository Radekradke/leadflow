# LeadFlow Imobiliário — Backend (API)

SaaS multi-tenant de distribuição de leads para imobiliárias.
NestJS + Prisma + PostgreSQL (com Row-Level Security).

## Estrutura

```
.
├── src/                    # código da aplicação (NestJS)
│   ├── main.ts             # bootstrap (helmet, cookies, CORS)
│   ├── app.module.ts       # módulos + guards globais
│   ├── common/             # auth, prisma, tenant, rbac, mail, security
│   └── modules/            # leads, distribution, transfers, tasks,
│                           # dashboard, queues, brokers, users, org,
│                           # auth, audit, interactions, health
├── prisma/
│   ├── schema.prisma       # modelo de dados
│   ├── seed.ts             # cria admin de plataforma + tenant demo
│   └── rbac-catalog.ts     # re-exporta o catálogo canônico de RBAC
├── enable_rls*.sql         # políticas de Row-Level Security (viram migrations)
├── Dockerfile              # build + migrate deploy + start
└── package.json
```

## Rodar localmente

Pré-requisitos: Node 20+, Docker (para o Postgres). Detalhes completos no
`DEPLOY.md` (vale para dev também). Resumo:

```bash
npm install
cp .env.example .env          # ajuste se precisar
# suba um Postgres, crie o papel leadflow_app (ver DEPLOY.md / CODEX_PROMPT.md)
npx prisma generate
npx prisma migrate dev        # cria tabelas; aplique também os enable_rls_*.sql
npx prisma db seed            # primeiro admin
npm run start:dev             # http://localhost:3000
```

Login demo: `admin@demo.local` / `Admin@12345`.

## Scripts

- `npm run build` — compila para `dist/` (`nest build`).
- `npm run start:dev` — dev com watch.
- `npm test` — testes (Jest). Ex.: mascaramento, permissões, máquina de status.
- `npm run prisma:seed` — roda o seed.

## Segurança (pilares)

- **Multi-tenant** isolado em duas camadas: extensão do Prisma (injeta o tenant)
  + **RLS** no Postgres (papel de runtime `leadflow_app` sem BYPASSRLS).
- **Auth** por cookies httpOnly, Argon2id, refresh token rotativo, CSRF
  double-submit. SameSite por env (`COOKIE_SAMESITE`).
- **RBAC** com fonte única em `src/common/rbac/permissions.ts`. Papéis e a
  matriz de acesso (incl. CPF visível / telefone mascarado) em `ROLES.md`.
- **Mascaramento**: CPF liberado para simulação; telefone/WhatsApp mascarado
  para quem não tem `lead:read_contact` (ex.: corretor).

## Documentos

- `ROLES.md` — papéis e matriz de permissões.
- `DEPLOY.md` — subir em produção (Neon + Render + Vercel).
- `CODEX_PROMPT.md` — deixar tudo rodando do zero via Codex.
