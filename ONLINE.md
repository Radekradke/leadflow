# ONLINE — direto para produção (sem Docker)

Caminho enxuto para colocar o LeadFlow no ar sem montar o Postgres local.
O banco é o **Neon** desde o começo; sua máquina só é usada para **compilar**
e para **preparar o banco** (migrations + seed).

Tempo: cerca de 1 hora, sendo a maior parte esperando deploy.

> **Por que ainda existe passo local:** o código nunca foi compilado. Se um
> erro de tipo aparecer só no Render, cada correção vira um deploy de vários
> minutos. Localmente é instantâneo. Além disso, o **Shell do Render é
> recurso pago** — no plano grátis o seed tem que sair da sua máquina.

---

## O que roda onde (seu PC não fica no caminho)

Depois do setup, **nada depende da sua máquina** — pode desligar, formatar,
viajar:

| Parte | Onde roda | Disponibilidade |
|---|---|---|
| Banco de dados | **Neon** (gerenciado) | 24/7 |
| API (backend) | **Render** | 24/7 **no plano pago** — ver abaixo |
| Site (frontend) | **Vercel** | 24/7 |
| Seu PC | só no setup (compilar + preparar o banco) | pode desligar depois |

### Sobre "100% do tempo": o plano grátis do Render NÃO serve para cliente real

O serviço gratuito do Render **hiberna após 15 minutos sem tráfego** e leva
**30–60 segundos** para acordar. Para um CRM recebendo lead de WhatsApp isso
é grave: a mensagem da Meta pode chegar enquanto o serviço dorme e o lead
demora — ou se perde numa reentrega.

**Para uso real com cliente, o mínimo é o Render Starter: US$ 7/mês** (plano
de workspace Hobby é US$ 0; você paga só a instância). Isso elimina a
hibernação — fica realmente sempre no ar.

Resumo de custo para começar:

| Item | Custo |
|---|---|
| Neon (banco) | grátis para começar |
| Render Starter (API sempre no ar) | US$ 7/mês |
| Vercel (site) | grátis |
| **Total** | **~US$ 7/mês (~R$ 40)** |

> Use o plano grátis do Render só enquanto você mesmo testa. **Antes de
> apontar o WhatsApp do cliente, mude para Starter.**

---

## 1. Compilar (5 min, sem Docker, sem banco)

Na pasta do projeto:

```bash
npm install
cd frontend && npm install && cd ..
npx prisma generate
npm run build
cd frontend && npm run build && cd ..
```

**Se aparecer erro de tipo**, é esperado. Duas saídas:
- cole o erro no chat e eu devolvo o arquivo corrigido; ou
- abra o **Claude Code** na pasta e cole o `PROMPT_CLAUDE_CODE.md`.

Só siga adiante quando os dois builds passarem.

> Node 24: se o Prisma reclamar de engine, instale o **Node 22 LTS**
> (Windows: [nvm-windows](https://github.com/coreybutler/nvm-windows) →
> `nvm install 22 && nvm use 22`) e repita este passo.

## 2. Criar o banco no Neon (10 min)

1. Crie uma conta em <https://neon.tech> e um projeto (região mais perto: US East).
2. Copie a **connection string** do owner — é o seu `DATABASE_URL`.
3. Abra o **SQL Editor** do Neon e rode (troque a senha):

```sql
CREATE ROLE leadflow_app LOGIN PASSWORD 'UMA_SENHA_FORTE_AQUI';
GRANT CONNECT ON DATABASE neondb TO leadflow_app;
GRANT USAGE ON SCHEMA public TO leadflow_app;
```

4. Monte o `APP_DATABASE_URL`: é a mesma string do owner, trocando usuário e
   senha por `leadflow_app` e a senha que você acabou de definir.

> Esse papel **sem BYPASSRLS** é o que garante que uma imobiliária nunca
> enxergue os dados da outra. Não use o owner como conexão da aplicação.

## 3. Preparar o banco a partir da sua máquina (10 min)

Crie o `.env` local **apontando para o Neon**:

```bash
cp .env.example .env
```

Edite e preencha:

```env
DATABASE_URL="<string do owner do Neon>"
APP_DATABASE_URL="<string do leadflow_app>"
JWT_ACCESS_SECRET="<openssl rand -base64 48>"
WHATSAPP_ENC_KEY="<openssl rand -hex 32>"
DEMO_ADMIN_PASSWORD="Admin@12345"
PLATFORM_ADMIN_PASSWORD="Admin@12345"
WHATSAPP_DEV_MODE="true"
```

Crie as tabelas:

```bash
npx prisma migrate dev --name init --skip-seed
```

Aplique a segurança de linha (RLS) — **não pule**:

```bash
for SQL_FILE in enable_rls.sql enable_rls_refresh_token.sql enable_rls_password_reset.sql enable_rls_audit_log.sql enable_rls_sprint2.sql enable_rls_distribution.sql enable_rls_whatsapp.sql enable_rls_adroute.sql; do
  NAME=$(echo $SQL_FILE | sed 's/\.sql//' | sed 's/enable_/rls_/')
  npx prisma migrate dev --create-only --name "$NAME" --skip-seed
  LATEST=$(ls -d prisma/migrations/*/ | sort | tail -1)
  cat "$SQL_FILE" >> "${LATEST}migration.sql"
  npx prisma migrate dev --skip-seed
done
```

No **SQL Editor do Neon**, libere as permissões nas tabelas recém-criadas:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
```

Crie o admin e a cadeia de distribuição de demonstração:

```bash
npx prisma db seed
```

Isso cria `admin@demo.local` / `Admin@12345`, a fila **Regional Nova Iguaçu**
(60% Márcio / 40% Wellington) e 4 corretores.

## 4. Subir para o GitHub (5 min)

**Importante:** a pasta `prisma/migrations/` precisa ir junto — é dela que o
Render cria as tabelas. O `.env` **não** vai (o `.gitignore` já bloqueia).

```bash
git init
git add .
git commit -m "LeadFlow"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/leadflow.git
git push -u origin main
```

Confira no GitHub: tem `prisma/migrations/`? tem `.env`? (o segundo deve ser **não**)

## 5. Backend no Render (15 min)

1. **New → Web Service** apontando para o repositório.
2. Ambiente **Docker** (o `Dockerfile` na raiz já roda `prisma migrate deploy`).
3. **Health Check Path**: `/health`
4. Variáveis de ambiente:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string do owner do Neon |
| `APP_DATABASE_URL` | string do `leadflow_app` |
| `JWT_ACCESS_SECRET` | o mesmo do `.env` |
| `WHATSAPP_ENC_KEY` | o mesmo do `.env` |
| `WHATSAPP_DEV_MODE` | `true` (por enquanto) |
| `NODE_ENV` | `production` |
| `COOKIE_SAMESITE` | `none` |
| `FRONTEND_ORIGIN` | preencha no passo 6 |

5. Deploy. Ao final, abra `https://SUA-API.onrender.com/health` — tem que
   responder `{"status":"ok"}`.

> **Escolha da instância:** para você testar, a **Free** serve. Para o
> cliente usar de verdade, escolha **Starter (US$ 7/mês)** — a Free hiberna
> em 15 min e pode atrasar ou perder lead que chega pelo WhatsApp.

## 6. Frontend na Vercel (10 min)

1. Importe o mesmo repositório.
2. **Root Directory**: `frontend`
3. Variável `VITE_API_URL` = a URL do Render.
4. Deploy e anote a URL.
5. **Volte ao Render** e ajuste `FRONTEND_ORIGIN` para a URL da Vercel
   (exata, sem barra no final). Aguarde o redeploy.

## 7. Testar (5 min)

1. Abra a URL da Vercel e entre com `admin@demo.local` / `Admin@12345`.
2. Vá em **Atendimento → "Simular lead"**, confirme.
3. Em **Leads**, o lead tem que estar **com corretor responsável**.
4. Repita ~10 vezes com telefones diferentes; em **Filas**, veja a proporção
   60/40 entre as equipes.

Funcionou? Está no ar e você pode mostrar para o cliente.

### Se o login não funcionar

Quase sempre é uma destas três, nesta ordem:
1. `COOKIE_SAMESITE=none` no Render
2. `FRONTEND_ORIGIN` exatamente igual à URL da Vercel (sem `/` no final)
3. `VITE_API_URL` apontando para o Render (confira no DevTools ▸ Network)

## 8. Depois: WhatsApp real

Agora sim você tem a URL pública que a Meta exige. Siga o `WHATSAPP.md`:
criar o app na Meta, apontar o webhook para
`https://SUA-API.onrender.com/whatsapp/webhook`, assinar o campo **messages**
e conectar o número.

Ao conectar um número real, troque `WHATSAPP_DEV_MODE` para `false`.

> Lembre: o número registrado na Cloud API **sai do WhatsApp do celular**.
> Use um chip separado, nunca o número principal do cliente.
