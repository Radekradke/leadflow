# COMEÇAR AQUI — do zero até o primeiro lead real

Roteiro único, na ordem. Não pule etapas: cada parte depende da anterior.

- **Parte A** (passos 1–10): rodar na sua máquina e ver capturar→responder funcionando.
- **Parte B** (passos 11–15): colocar no ar (URL pública).
- **Parte C** (passos 16–20): conectar o WhatsApp de verdade.

Dá para parar no fim da Parte A e já mostrar tudo funcionando para o Lucas.

---

# PARTE A — Rodar na sua máquina

## 1. Instalar os pré-requisitos

- **Node 20 ou superior** — confira com `node -v`
- **Docker** (para o Postgres local)
- **Git** e uma conta no **GitHub**

## ⚡ Atalho: rodar os passos 2 a 8 de uma vez

Se preferir não fazer passo a passo, existe um script que faz tudo isso
sozinho (dependências, Postgres, papel de runtime, `.env` com segredos
gerados, migrations, RLS, permissões e seed):

```bash
bash setup-local.sh
```

Pode rodar de novo sem medo — ele pula o que já está feito e não sobrescreve
um `.env` existente. Se algo falhar, ele para e diz exatamente o quê.
**Depois dele, pule direto para o passo 9.**

Se preferir entender cada etapa (recomendado na primeira vez), siga na ordem
abaixo.

---

## 2. Instalar as dependências

Na pasta do projeto:

```bash
npm install
cd frontend && npm install && cd ..
```

## 3. Subir o Postgres

```bash
docker run --name leadflow-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=leadflow \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Espere uns 3 segundos para o container iniciar.

## 4. Criar o papel de runtime (`leadflow_app`)

Este é o papel **sem** BYPASSRLS — é ele que segura o vazamento entre
imobiliárias. Rode:

```bash
docker exec -i leadflow-db psql -U postgres -d leadflow << 'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'leadflow_app') THEN
    CREATE ROLE leadflow_app LOGIN PASSWORD 'leadflow_app';
  END IF;
END$$;

GRANT CONNECT ON DATABASE leadflow TO leadflow_app;
GRANT USAGE ON SCHEMA public TO leadflow_app;
SQL
```

## 5. Criar o arquivo `.env`

```bash
cp .env.example .env
```

Abra o `.env` e ajuste **estas linhas** (o resto pode ficar como está):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/leadflow?schema=public"
APP_DATABASE_URL="postgresql://leadflow_app:leadflow_app@localhost:5432/leadflow?schema=public"
JWT_ACCESS_SECRET="cole-aqui-o-resultado-de-openssl-rand-base64-48"
DEMO_ADMIN_PASSWORD="Admin@12345"
PLATFORM_ADMIN_PASSWORD="Admin@12345"
WHATSAPP_ENC_KEY="cole-aqui-o-resultado-de-openssl-rand-hex-32"
WHATSAPP_DEV_MODE="true"
```

Gere os dois segredos com:

```bash
openssl rand -base64 48    # → JWT_ACCESS_SECRET
openssl rand -hex 32       # → WHATSAPP_ENC_KEY
```

> `WHATSAPP_DEV_MODE="true"` é o que liga o modo simulação do passo 10.

## 6. Gerar o Prisma e criar as tabelas

```bash
npx prisma generate
npx prisma migrate dev --name init --skip-seed
```

## 7. Aplicar a segurança de linha (RLS)

Sem isso, o isolamento entre imobiliárias **não existe**. Rode o loop:

```bash
for SQL_FILE in enable_rls.sql enable_rls_refresh_token.sql enable_rls_password_reset.sql enable_rls_audit_log.sql enable_rls_sprint2.sql enable_rls_distribution.sql enable_rls_whatsapp.sql enable_rls_adroute.sql; do
  NAME=$(echo $SQL_FILE | sed 's/\.sql//' | sed 's/enable_/rls_/')
  npx prisma migrate dev --create-only --name "$NAME" --skip-seed
  LATEST=$(ls -d prisma/migrations/*/ | sort | tail -1)
  cat "$SQL_FILE" >> "${LATEST}migration.sql"
  npx prisma migrate dev --skip-seed
done
```

Depois, libere as permissões nas tabelas recém-criadas:

```bash
docker exec -i leadflow-db psql -U postgres -d leadflow << 'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
SQL
```

## 8. Criar o primeiro admin (seed)

```bash
npx prisma db seed
```

Isso cria o login demo: **admin@demo.local** / **Admin@12345**.

## 9. Subir backend e frontend

Em **dois terminais separados**:

```bash
# terminal 1 — API
npm run start:dev        # http://localhost:3000
```

```bash
# terminal 2 — frontend
cd frontend && npm run dev   # http://localhost:5173
```

Abra `http://localhost:5173` e faça login com o admin do passo 8.

> Se o `npm run build` ou o `start:dev` apontar erro de **tipo** do TypeScript,
> me mande a mensagem — eu corrijo. Aqui só consegui validar sintaxe e imports,
> porque o ambiente não gera o `@prisma/client`.

## 10. ✅ TESTE: capturar, DISTRIBUIR e responder (sem a Meta)

Este é o teste que prova o ciclo inteiro — é o que o Lucas pediu.

O seed já deixou pronta a cadeia:
**Regional Nova Iguaçu** → **Gerente Márcio (60%)** e **Gerente Wellington (40%)**,
com dois corretores cada, todos disponíveis.

1. No app, vá em **Atendimento**.
2. Clique em **"Simular lead"** (aparece porque `WHATSAPP_DEV_MODE="true"`).
3. Preencha telefone + mensagem e confirme.
4. Confira em **Leads**: o lead foi criado com origem WhatsApp **e já está
   com um corretor responsável** — não ficou parado.
5. Repita umas 10 vezes com telefones **diferentes**. A maioria deve cair
   no time do Márcio (60%). Em **Filas**, o contador de cada equipe mostra
   quantos leads recebeu.
6. Repita com um telefone **já usado**: a mensagem entra na conversa
   existente e **não** troca o corretor.
7. Abra uma conversa e **responda** — a mensagem aparece na thread.

Funcionou? Então capturar → distribuir → responder está OK.
**Pode mostrar para o Lucas.**

> Ajustar os percentuais: vá em **Filas**, abra o regional e arraste os
> sliders de cada equipe.

---

# PARTE B — Colocar no ar

Necessário porque a Meta precisa de uma **URL pública HTTPS** para entregar
as mensagens no webhook. Detalhes e telas em `DEPLOY.md`.

## 11. Subir o código para o GitHub

Crie um repositório **privado** (tem dado sensível de configuração) e faça o push.

## 12. Criar o banco no Neon

1. Crie um projeto em <https://neon.tech> (grátis).
2. No **SQL Editor** do Neon, crie o papel `leadflow_app` (mesmo SQL do passo 4).
3. Guarde as **duas URLs**: a do owner e a do `leadflow_app`.

## 13. Publicar a API no Render

1. Novo **Web Service** apontando para o repositório.
2. Variáveis de ambiente: as mesmas do `.env`, com
   `DATABASE_URL` e `APP_DATABASE_URL` do Neon, `NODE_ENV=production` e
   `COOKIE_SAMESITE=none`.
3. **Health Check Path**: `/health`
4. Depois do deploy, rode as migrations/RLS e o seed uma vez (Shell do Render).
5. Anote a URL da API (ex.: `https://leadflow-api.onrender.com`).

## 14. Publicar o frontend na Vercel

1. Importe o repositório; em **Root Directory** escolha **`frontend`**.
2. Variável `VITE_API_URL` = a URL do Render.
3. Deploy → anote a URL (ex.: `https://leadflow.vercel.app`).
4. **Volte ao Render** e ajuste `FRONTEND_ORIGIN` para essa URL exata (sem barra final).

## 15. ✅ TESTE: login em produção

Abra a URL da Vercel e faça login. Se der erro, confira nesta ordem:
`COOKIE_SAMESITE=none` → `FRONTEND_ORIGIN` exata → `VITE_API_URL` correta.

---

# PARTE C — WhatsApp de verdade

Passo a passo com mais detalhe em `WHATSAPP.md`.

## 16. Criar o app na Meta

1. Em <https://developers.facebook.com>, crie um app do tipo **Business**.
2. Adicione o produto **WhatsApp**.
3. Em **App Settings → Basic**, copie o **App Secret**.

## 17. Preencher as variáveis do WhatsApp no Render

| Variável | Valor |
|---|---|
| `WHATSAPP_APP_SECRET` | o App Secret do passo 16 |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | invente um (`openssl rand -hex 16`) |
| `WHATSAPP_ENC_KEY` | `openssl rand -hex 32` |
| `WHATSAPP_DEV_MODE` | `false` |

> **Atenção:** guarde a `WHATSAPP_ENC_KEY`. Se ela mudar depois, os tokens já
> salvos no banco não descriptografam mais e você terá que reconectar os números.

## 18. Apontar o webhook

No painel do WhatsApp, em **Configuration → Webhook**:

- **Callback URL**: `https://SUA-API-NO-RENDER/whatsapp/webhook`
- **Verify token**: o mesmo do passo 17
- Assine o campo **messages**

Se a verificação falhar, é quase sempre o verify token diferente entre os dois lados.

## 19. Conectar o número da imobiliária

1. No painel da Meta, registre o número e pegue o **Phone Number ID** e um
   **Access Token** (de preferência permanente, de System User).
2. No app (logado como Admin), vá em **Atendimento → Configurar** e cole os dois.

## 20. ✅ TESTE FINAL: o primeiro lead real

1. De um celular **diferente**, mande uma mensagem para o número da imobiliária.
2. Em segundos, a conversa aparece em **Atendimento** e o lead em **Leads**.
3. Responda pelo sistema — a mensagem chega no celular.

Chegou nos dois sentidos? Está capturando e respondendo leads reais.

---

## Se algo der errado

| Sintoma | Onde olhar primeiro |
|---|---|
| Erro de tipo no `npm run build` | Me mande a mensagem exata — eu corrijo |
| API não sobe | Falta variável no `.env` (a validação diz qual) |
| Login não gruda em produção | `COOKIE_SAMESITE=none` + `FRONTEND_ORIGIN` exata |
| Verificação do webhook falha | Verify token diferente entre Meta e Render |
| Mensagem não chega no app | Campo **messages** não assinado, ou `WHATSAPP_APP_SECRET` errado |
| Resposta sai como "falhou" | Passaram 24h desde a última mensagem do cliente (a Meta exige template) |

## Depois que estiver rodando

Na ordem de valor:

1. **Distribuição automática** dos leads do WhatsApp (hoje entram como
   "aguardando distribuição"). É o que o Lucas pediu para montar junto.
2. **Templates** para responder fora da janela de 24h.
3. **Mídia** (foto/áudio) — hoje entra como marcador de texto.
