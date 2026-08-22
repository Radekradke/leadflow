# Subindo o LeadFlow para produção — passo a passo

Guia prático para colocar o LeadFlow no ar. Stack do deploy:

| Camada       | Onde                       | Custo para começar |
|--------------|----------------------------|--------------------|
| Banco        | **Neon** (Postgres)        | Grátis             |
| Backend API  | **Render** (Web Service)   | Grátis (com ressalva) |
| Frontend     | **Vercel**                 | Grátis             |

Por que essa escolha: o LeadFlow usa **dois papéis de banco** para a Row-Level
Security (um dono com BYPASSRLS para migrar/semear, e um de runtime sem BYPASSRLS).
O Neon deixa você criar o segundo papel — nem todo Postgres gerenciado deixa.
A Vercel é o caminho natural para React/Vite. O Render tem plano grátis para
começar (ressalva mais abaixo).

> **Pré-requisito honesto:** o projeto precisa **buildar localmente primeiro**.
> Rode o `CODEX_PROMPT.md` e confirme que `npm run build` passa no backend E no
> frontend antes de tentar o deploy. Subir código que nunca compilou só
> transfere o erro para um lugar mais difícil de depurar.

---

## Parte 0 — Antes de tudo: o código no GitHub

O Render e a Vercel fazem deploy a partir de um repositório Git.

1. Crie um repositório no GitHub (pode ser privado).
2. **Importante:** confirme que estes itens estão commitados:
   - a pasta `prisma/migrations/` **inteira** (gerada quando você rodou o Codex
     localmente) — é dela que o `prisma migrate deploy` vive em produção;
   - o `Dockerfile` (já criado na raiz do backend);
   - a pasta `frontend/` com o `vercel.json`.
3. Confirme que o `.env` **NÃO** está commitado (deve estar no `.gitignore`).
   Segredo nenhum vai para o Git.

```bash
git init
git add .
git commit -m "LeadFlow inicial"
git branch -M main
git remote add origin git@github.com:SEU_USUARIO/leadflow.git
git push -u origin main
```

---

## Parte 1 — Banco de dados (Neon)

1. Crie conta em **neon.tech** e um projeto novo (escolha a região mais perto —
   `AWS São Paulo` se disponível, senão `US East`).
2. No painel do projeto, copie a **connection string**. Ela parece com:
   ```
   postgresql://OWNER:SENHA@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   Esse é o seu **`DATABASE_URL`** (papel dono — migra e semeia).
3. Abra o **SQL Editor** do Neon e crie o papel de runtime (sem BYPASSRLS):
   ```sql
   CREATE ROLE leadflow_app LOGIN PASSWORD 'ESCOLHA_UMA_SENHA_FORTE';
   GRANT CONNECT ON DATABASE neondb TO leadflow_app;
   GRANT USAGE ON SCHEMA public TO leadflow_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leadflow_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO leadflow_app;
   ```
   > Rode os `GRANT ON ALL TABLES` **de novo depois** que as migrações tiverem
   > criado as tabelas (a primeira vez não existe tabela ainda). Há um lembrete
   > na Parte 2.
4. Monte a **`APP_DATABASE_URL`** trocando usuário/senha pelo `leadflow_app`:
   ```
   postgresql://leadflow_app:SENHA_FORTE@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
   ```

Guarde as duas URLs — vão para as variáveis do Render.

---

## Parte 2 — Backend (Render)

1. Em **render.com**, clique **New ▸ Web Service** e conecte o repositório.
2. Configure:
   - **Runtime:** Docker (ele detecta o `Dockerfile` na raiz).
   - **Region:** a mais perto (Ohio/US-East costuma ser a opção grátis).
   - **Instance Type:** Free para testar.
3. Em **Environment**, adicione as variáveis (copie do seu `.env`, com valores de
   produção):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a URL do **owner** (Neon) |
   | `APP_DATABASE_URL` | a URL do **leadflow_app** (Neon) |
   | `JWT_ACCESS_SECRET` | gere com `openssl rand -base64 48` |
   | `JWT_ACCESS_TTL` | `15m` |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `FRONTEND_ORIGIN` | a URL da Vercel (você preenche na Parte 3) |
   | `COOKIE_SAMESITE` | `none` (front e back ficam em domínios diferentes) |
   | `MAIL_TRANSPORT` | `console` por enquanto |
   | `PLATFORM_ADMIN_EMAIL` | seu e-mail de dono |
   | `PLATFORM_ADMIN_PASSWORD` | uma senha forte |
   | `DEMO_ADMIN_EMAIL` | e-mail do primeiro admin do tenant |
   | `DEMO_ADMIN_PASSWORD` | uma senha forte |

   > Por que `COOKIE_SAMESITE=none`: como a Vercel (`*.vercel.app`) e o Render
   > (`*.onrender.com`) são **domínios diferentes**, o navegador só envia o
   > cookie de sessão se ele for `SameSite=None; Secure`. Com `lax` o login
   > falharia silenciosamente. A proteção contra CSRF continua firme porque o
   > app usa o token double-submit.

4. Em **Health Check Path**, coloque `/health` (o Render usa isso para saber
   se o serviço subiu antes de mandar tráfego).
5. Clique **Create Web Service**. O Render builda pelo Dockerfile e, no start,
   roda `prisma migrate deploy` automaticamente (cria as tabelas + as políticas
   de RLS). Acompanhe os logs.
6. **Depois do primeiro deploy** (tabelas já existem), volte ao SQL Editor do
   Neon e rode os GRANTs de novo para o `leadflow_app` enxergar as tabelas
   recém-criadas:
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leadflow_app;
   ```
7. **Criar o primeiro admin (seed), uma vez.** No Render, abra o **Shell** do
   serviço e rode:
   ```bash
   npx prisma db seed
   ```
   Isso cria o admin de plataforma + o tenant demo com o admin que você definiu
   nas variáveis. (Faça isso só uma vez.)
8. Anote a URL pública do serviço, algo como `https://leadflow-api.onrender.com`.

> **Ressalva do plano grátis do Render:** o serviço "dorme" após ~15 min sem uso
> e a primeira requisição depois disso demora ~30s para acordar. Para um produto
> de verdade, suba para o plano pago (US$7/mês) ou use o **Railway**. O Postgres
> do Neon não dorme.

---

## Parte 3 — Frontend (Vercel)

1. Em **vercel.com**, **Add New ▸ Project** e importe o mesmo repositório.
2. Em **Root Directory**, selecione **`frontend`** (o app React vive lá).
3. A Vercel detecta Vite sozinha. Em **Environment Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | a URL do backend no Render, ex.: `https://leadflow-api.onrender.com` |

   > Em produção o front chama o backend **direto** (sem o proxy `/api` do dev).
   > É por isso que o `VITE_API_URL` aponta para a URL real — e é isso que faz o
   > cookie `refresh_token` (path `/auth`) casar corretamente.

4. Deploy. A Vercel te dá uma URL tipo `https://leadflow.vercel.app`.
5. **Volte ao Render** e ajuste a variável `FRONTEND_ORIGIN` para essa URL exata
   (sem barra no final): `https://leadflow.vercel.app`. Salve — o Render
   reinicia. Isso libera o CORS com credenciais para o seu front.

---

## Parte 4 — Testar de ponta a ponta

1. Abra `https://leadflow.vercel.app`.
2. Faça login com o `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD`.
3. Confirme: a sidebar mostra seu nome, o painel carrega, criar lead funciona.
4. **Se o login "não fizer nada":** é quase sempre cookie cross-domain. Cheque:
   - `COOKIE_SAMESITE=none` no Render? (sem isso o cookie não é salvo)
   - `FRONTEND_ORIGIN` é **exatamente** a URL da Vercel? (CORS)
   - `VITE_API_URL` aponta para o Render? (no DevTools ▸ Network, a chamada de
     login deve ir para `onrender.com`, não para `/api`)
   - No DevTools ▸ Application ▸ Cookies, depois do login devem existir
     `access_token`, `refresh_token` e `csrf_token`.

---

## Caminho alternativo (mais robusto): domínio próprio

Se você comprar um domínio (~R$40/ano), dá para usar subdomínios e voltar para
o `SameSite=lax`, que é mais seguro:

- Frontend: `app.seudominio.com` (domínio custom na Vercel)
- Backend: `api.seudominio.com` (domínio custom no Render)
- No Render: `COOKIE_SAMESITE=lax` e `FRONTEND_ORIGIN=https://app.seudominio.com`
- No Vercel: `VITE_API_URL=https://api.seudominio.com`

Como os dois são subdomínios do **mesmo** domínio registrável, o cookie `Lax`
flui entre eles. É o cenário ideal — mas exige o domínio, então deixei o caminho
sem-domínio como o principal para você começar hoje.

---

## Depois que estiver no ar — os 3 primeiros ajustes

1. **E-mail real.** Troque `MAIL_TRANSPORT` por um provedor (Resend tem plano
   grátis generoso) implementando o `MailService`. Sem isso, "esqueci a senha"
   não chega a ninguém.
2. **Trocar a senha do admin demo** ou criar um tenant real e desativar o demo.
3. **Erros e logs.** Plugue um Sentry no backend — em produção você precisa
   saber quando algo quebra sem ficar olhando log.

Qualquer um desses três eu te ajudo a fazer no próximo passo.
