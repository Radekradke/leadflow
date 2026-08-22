# LeadFlow Imobiliário — Prompt de Setup Completo para Codex

> ⚠️ **ATUALIZAÇÃO — já feito, não refazer:**
> - O código-fonte já está em `src/` (NestJS padrão) e o `schema.prisma` em `prisma/`.
> - `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json` e
>   `.gitignore` **já existem** — **pule as Tarefas 1, 2 e 3**.
> - Comece na **Tarefa 4** (instalar deps). O resto do guia continua válido.
> - Build do backend: `npm run build` (nest build, sourceRoot `src`, gera `dist/main.js`).


## Contexto do projeto

Você está trabalhando no **LeadFlow Imobiliário**, um SaaS multi-tenant de distribuição
de leads para imobiliárias. O backend e o frontend foram escritos por um assistente de IA
e estão funcionalmente completos, mas ainda precisam de: `package.json` do backend,
instalação de dependências, correções de TypeScript, migrations do banco de dados com Row-
Level Security (RLS), seed, e verificação de build dos dois lados.

**Stack:**
- Backend: NestJS 10 · Prisma ORM · PostgreSQL 16 · TypeScript
- Frontend: React 18 · Vite · TypeScript · Tailwind CSS 3 · TanStack Query 5 · dnd-kit

---

## Estrutura de arquivos já existente

```
leadflow/                          ← raiz do backend
├── app.module.ts
├── main.ts
├── schema.prisma
├── .env.example
├── enable_rls.sql
├── enable_rls_audit_log.sql
├── enable_rls_refresh_token.sql
├── enable_rls_sprint2.sql
├── enable_rls_distribution.sql
├── enable_rls_whatsapp.sql enable_rls_adroute.sql
├── common/
│   ├── auth/auth.decorators.ts · auth.guards.ts · csrf.guard.ts
│   ├── events/app-events.ts
│   ├── prisma/platform-prisma.service.ts · prisma.module.ts
│   │         prisma.service.ts · tenant-rls.extension.ts
│   ├── rbac/permissions.ts
│   ├── security/password.ts · token.util.ts
│   ├── tenant/tenant-context.interceptor.ts · .middleware.ts · .service.ts
│   └── validation/zod-validation.pipe.ts
├── modules/
│   ├── audit/         · auth/         · brokers/      · dashboard/
│   ├── distribution/  · interactions/ · leads/        · org/
│   ├── platform/      · queues/       · tasks/        · transfers/
│   └── users/
├── prisma/
│   ├── seed.ts
│   ├── provision-tenant.ts
│   └── rbac-catalog.ts
└── frontend/                      ← frontend React
    ├── index.html · vite.config.ts · tailwind.config.ts
    ├── tsconfig.json · tsconfig.node.json · postcss.config.js
    ├── package.json
    └── src/
        ├── App.tsx · main.tsx · index.css
        ├── components/ AppShell · LeadDetailDrawer · ProtectedRoute
        │              StatusPill · Toast · ui
        ├── lib/  api · auth · format · labels · leadStatus · queryClient · types
        └── pages/ AdminPage · DashboardPage · KanbanPage · LeadsPage
                   LoginPage · QueuesPage · TasksPage
```

---

## Tarefas que você deve executar em ordem

### TAREFA 1 — Criar o `package.json` do backend

Crie `leadflow/package.json` com o seguinte conteúdo exato:

```json
{
  "name": "leadflow-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint src --ext .ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "ts-node --transpile-only prisma/seed.ts"
  },
  "prisma": {
    "seed": "ts-node --transpile-only prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.10",
    "@nestjs/core": "^10.3.10",
    "@nestjs/event-emitter": "^2.0.4",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.10",
    "@nestjs/throttler": "^6.1.0",
    "@prisma/client": "^5.16.2",
    "argon2": "^0.41.1",
    "cookie-parser": "^1.4.6",
    "helmet": "^7.1.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/schematics": "^10.1.4",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.12",
    "@types/passport-jwt": "^4.0.1",
    "prisma": "^5.16.2",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.5.4"
  }
}
```

### TAREFA 2 — Criar `tsconfig.json` do backend

Crie `leadflow/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2020",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false,
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### TAREFA 3 — Criar `nest-cli.json`

Crie `leadflow/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": ".",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

### TAREFA 4 — Instalar dependências

```bash
# Backend
cd leadflow
npm install

# Frontend
cd frontend
npm install
```

### TAREFA 5 — Criar o `.env` de desenvolvimento

Copie `.env.example` para `.env` e preencha com valores de dev:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/leadflow?schema=public"
APP_DATABASE_URL="postgresql://leadflow_app:leadflow_app@localhost:5432/leadflow?schema=public"
JWT_ACCESS_SECRET="dev-secret-mude-em-producao-$(openssl rand -hex 16)"
JWT_ACCESS_TTL="15m"
FRONTEND_ORIGIN="http://localhost:5173"
PORT="3000"
NODE_ENV="development"
PLATFORM_ADMIN_EMAIL="owner@leadflow.local"
PLATFORM_ADMIN_PASSWORD="Admin@12345"
DEMO_ADMIN_EMAIL="admin@demo.local"
DEMO_ADMIN_PASSWORD="Admin@12345"
MAIL_TRANSPORT="console"
```

> Observação: com `MAIL_TRANSPORT="console"` o link de reset de senha é impresso no log do servidor (dev). Em produção, implemente um provedor real no `MailService`.

### TAREFA 6 — Verificar e corrigir erros de TypeScript no backend

Execute:
```bash
cd leadflow
npx tsc --noEmit
```

Corrija **todos** os erros antes de continuar. Regras críticas para correções:
- **Nunca use `any` explícito** — use `unknown` e narrowing quando necessário.
- **Campos do schema Prisma**: se um campo não existir no schema, remova-o do código
  (não adicione ao schema). O schema é a fonte da verdade.
- **`prisma.tx(fn)`**: o parâmetro de `fn` é `Prisma.TransactionClient` — importe de
  `@prisma/client`.
- **`this.prisma.client`**: é o `PrismaClient` com extensão RLS. Use para queries normais.
- **`this.platformPrisma`**: é o `PrismaClient` sem RLS. Use SOMENTE em auth login,
  onboarding e seed.
- **`EventEmitter2`**: se houver erro de import, confirme que `@nestjs/event-emitter`
  está instalado.
- **Decorators NestJS** (`@Injectable`, `@Controller`, etc.) exigem
  `emitDecoratorMetadata: true` e `experimentalDecorators: true` no tsconfig — já
  estão no tsconfig do passo 2.
- Se `Prisma.TransactionClient` não tiver um método como `.$queryRaw`, use tipagem mais
  permissiva com `as unknown as PrismaClient` SOMENTE neste caso específico.

### TAREFA 7 — Criar e migrar o banco de dados

#### 7a. Subir Postgres (se não houver um rodando)

```bash
docker run --name leadflow-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=leadflow \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Aguarde 3 segundos para o container inicializar.

#### 7b. Criar o usuário de runtime (RLS)

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
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO leadflow_app;
SQL
```

#### 7c. Rodar as migrations e RLS

O Prisma precisa do schema e das migrations. Como não há diretório `prisma/migrations`
ainda, crie-o e rode a migration inicial:

```bash
cd leadflow

# 1. Gerar cliente Prisma
npx prisma generate

# 2. Criar a migration inicial (cria as tabelas)
npx prisma migrate dev --name init --skip-seed

# 3. Para cada arquivo RLS, criar uma migration vazia e aplicar o SQL
for SQL_FILE in enable_rls.sql enable_rls_refresh_token.sql enable_rls_password_reset.sql enable_rls_audit_log.sql enable_rls_sprint2.sql enable_rls_distribution.sql enable_rls_whatsapp.sql enable_rls_adroute.sql; do
  NAME=$(echo $SQL_FILE | sed 's/\.sql//' | sed 's/enable_/rls_/')
  npx prisma migrate dev --create-only --name "$NAME" --skip-seed
  # Pegar o diretório da migration mais recente e colar o SQL lá dentro
  LATEST=$(ls -d prisma/migrations/*/ | sort | tail -1)
  cat "$SQL_FILE" >> "${LATEST}migration.sql"
  npx prisma migrate dev --skip-seed
done

# 4. Garantir grants para leadflow_app (execute após as migrations)
docker exec -i leadflow-db psql -U postgres -d leadflow << 'SQL'
GRANT USAGE ON SCHEMA public TO leadflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
SQL

# 5. Rodar o seed
npx prisma db seed
```

Se o loop acima não funcionar no shell disponível, execute manualmente um por um:

```bash
npx prisma migrate dev --create-only --name rls_core --skip-seed
# Cole o conteúdo de enable_rls.sql no arquivo migration.sql gerado
npx prisma migrate dev --skip-seed

npx prisma migrate dev --create-only --name rls_refresh --skip-seed
# Cole enable_rls_refresh_token.sql
npx prisma migrate dev --skip-seed

# ...repita para rls_audit, rls_sprint2, rls_distribution
npx prisma db seed
```

#### 7d. Verificar que as migrations rodaram

```bash
npx prisma migrate status
```
Deve mostrar todas as migrations como "Applied".

### TAREFA 8 — Verificar e corrigir erros de TypeScript no frontend

```bash
cd leadflow/frontend
npx tsc --noEmit
```

Corrija todos os erros. Regras para correções:
- **`useQuery` / `useMutation`**: os tipos genéricos precisam ser explícitos se o TS
  reclamar de inferência.
- **`api.del`**: está definido em `src/lib/api.ts` e chama `request<T>('DELETE', path)`.
  Se faltar, adicione: `del: <T>(path: string) => request<T>('DELETE', path)`.
- **`btn-sm` / `btn-primary` / `btn-ghost`**: são classes definidas em `index.css`
  via `@layer components`. Se o Tailwind reclamar, confirme que o `postcss.config.js`
  está correto.
- **`BrokerProfile.user`** no frontend: é `{ id: string; name: string; email: string;
  isActive?: boolean }`. Se campos faltarem em respostas de API, tornar opcionais com `?`.
- **`LEAD_STATUS_META`**: está em `lib/types.ts`. Confirme que o import existe nas páginas
  que usam `StatusPill`.
- **Imports de `@dnd-kit/core`**: `DndContext`, `PointerSensor`, `useDraggable`,
  `useDroppable`, `useSensor`, `useSensors`, `DragEndEvent` — todos vêm de
  `@dnd-kit/core`.

### TAREFA 9 — Build de produção dos dois projetos

```bash
# Backend
cd leadflow
npm run build
# Deve terminar sem erros em dist/

# Frontend
cd frontend
npm run build
# Deve gerar dist/ sem erros
```

Se qualquer build falhar, corrija os erros e rode novamente antes de continuar.

### TAREFA 10 — Teste de smoke do backend

Com o banco rodando e o `.env` preenchido, suba o backend e execute os testes básicos:

```bash
cd leadflow
npm run start:dev &
sleep 5  # aguarda o servidor iniciar

# 1. Login (deve retornar cookie access_token + csrf_token)
curl -s -c /tmp/lf-cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.local","password":"Admin@12345"}' | jq .

# 2. Ler o csrf token do cookie
CSRF=$(grep csrf_token /tmp/lf-cookies.txt | awk '{print $7}')

# 3. GET /auth/me — deve retornar { id, name, email, roleType, permissions }
curl -s -b /tmp/lf-cookies.txt http://localhost:3000/auth/me | jq .

# 4. Criar um lead de teste
curl -s -b /tmp/lf-cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -X POST http://localhost:3000/leads \
  -d '{"name":"Lead Teste","phone":"(21) 99999-0000","origin":"WEBSITE"}' | jq .

# 5. Listar leads
curl -s -b /tmp/lf-cookies.txt \
  "http://localhost:3000/leads?page=1&pageSize=10" | jq .

# 6. Listar filas
curl -s -b /tmp/lf-cookies.txt http://localhost:3000/queues | jq .

# 7. Dashboard operacional
curl -s -b /tmp/lf-cookies.txt http://localhost:3000/dashboard/operational | jq .

# 8. Dashboard gerencial
curl -s -b /tmp/lf-cookies.txt http://localhost:3000/dashboard/management | jq .
```

Todos os endpoints devem retornar `2xx`. Se algum retornar `401`, verifique os cookies.
Se retornar `500`, leia o log do NestJS.

### TAREFA 11 — Ajustes de compatibilidade obrigatórios

Estes itens são conhecidos e **devem** ser corrigidos:

#### 11a. `LeadOrigin` enum: garantir que os valores do frontend batem com o schema

No frontend (`LeadsPage.tsx`), o campo `origin` usa valores como `'META_ADS'`,
`'GOOGLE_ADS'` etc. Verifique no `schema.prisma` o enum `LeadOrigin` e sincronize os
valores do array `ORIGINS` em `LeadsPage.tsx`.

#### 11b. `PropertyType` no DTO

Se `lead.dto.ts` referencia `PropertyType` e esse enum não existir no schema, remova
o campo do schema Zod ou adicione o enum ao `schema.prisma` e re-rode `prisma generate`.

#### 11c. `completedAt` em `task.service.ts`

Confirme que o campo `completedAt DateTime?` existe no modelo `Task` do `schema.prisma`.
Se não existir, adicione ao schema, crie uma migration (`prisma migrate dev --name
add_task_completed_at`) e re-gere o cliente.

#### 11d. Endpoint `GET /auth/me` deve retornar `name` e `email`

O `auth.service.ts` tem o método `enrichMe` que busca o perfil e retorna `{ ...user,
name, email }`. O `auth.controller.ts` deve chamar `this.authService.enrichMe(user)`.
Verifique que está assim — se não estiver, corrija.

#### 11e. `@nestjs/event-emitter` no `app.module.ts`

`EventEmitterModule.forRoot()` deve estar na lista de `imports` do `AppModule`.
Se não estiver, adicione:
```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
// ...
imports: [EventEmitterModule.forRoot(), ...]
```

#### 11f. Campos `fromStatus` opcional em `LeadStatusHistory`

O `lead.service.ts` passa `fromStatus: null` na criação do lead. Se o campo for
`LeadStatus` (não nullable) no schema, mude para `LeadStatus?` no schema e re-migre.

### TAREFA 12 — Criar `docker-compose.yml` de desenvolvimento

Crie `leadflow/docker-compose.yml` para facilitar o setup:

```yaml
version: '3.9'
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: leadflow
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pg_data:
```

Crie também `leadflow/docker-entrypoint-initdb.d/01-create-app-role.sql`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'leadflow_app') THEN
    CREATE ROLE leadflow_app LOGIN PASSWORD 'leadflow_app';
  END IF;
END$$;

GRANT CONNECT ON DATABASE leadflow TO leadflow_app;
```

Este script roda automaticamente quando o container sobe pela primeira vez.

### TAREFA 13 — Criar `README.md` com instruções de setup

Crie `leadflow/README.md` com as instruções mínimas para outro dev subir o projeto:

```markdown
# LeadFlow Imobiliário

SaaS multi-tenant de distribuição de leads para imobiliárias.

## Setup rápido (dev)

### Pré-requisitos
- Node.js 20+
- Docker (para o Postgres)

### 1. Banco de dados
```bash
docker compose up -d db
```

### 2. Backend
```bash
cp .env.example .env
# Edite .env se necessário (os defaults funcionam com o docker-compose)

npm install
npx prisma migrate dev --name init --skip-seed

# Aplicar as migrações de RLS (uma vez, em ordem):
# Para cada enable_rls_*.sql: crie migration vazia, cole o SQL, aplique.

npx prisma db seed
npm run start:dev   # http://localhost:3000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

### Login padrão
- **Email:** admin@demo.local
- **Senha:** Admin@12345

## Estrutura de pastas
- `common/` — utilitários cross-cutting (auth, prisma, RLS, RBAC)
- `modules/` — features de negócio (leads, distribution, tasks, etc.)
- `prisma/` — schema, seed e migrations
- `frontend/` — React + Vite + Tailwind
```

### TAREFA 14 — Validação final

Execute a sequência completa do zero para confirmar que funciona:

```bash
cd leadflow

# Limpar e recompilar
npm run build
echo "✓ Backend build OK"

cd frontend
npm run build
echo "✓ Frontend build OK"
```

Se ambos os builds passarem sem erros, o projeto está pronto.

---

## Regras que você NUNCA deve violar

1. **Tokens NUNCA em localStorage.** O frontend usa cookies httpOnly. O arquivo
   `src/lib/api.ts` passa `credentials: 'include'` em todos os fetches. Não altere isso.

2. **Senhas NUNCA em texto puro.** O `common/security/password.ts` usa Argon2id.
   Não substitua por bcrypt ou MD5.

3. **Tenant SEMPRE da sessão.** O `tenantId` vem do JWT/sessão autenticada, nunca
   do body da requisição. O `tenant-context.interceptor.ts` e o `prisma.service.ts`
   garantem isso.

4. **RLS é a segunda camada.** A extensão Prisma (`tenant-rls.extension.ts`) define
   `set_config('app.current_tenant', tenantId)` antes de cada query do cliente de
   runtime. O `PlatformPrismaService` (BYPASSRLS) só pode ser usado em auth login,
   onboarding e seed — nunca em rotas de negócio.

5. **Segredos em `.env`, nunca no código.** O `.env` não vai para o git
   (está no `.gitignore`).

6. **Não remova validações de permissão.** Cada rota tem `@RequirePermissions(...)`.
   Não remova nem substitua por `@Public`.

7. **Não quebre os guards.** A ordem `JwtAuthGuard → CsrfGuard → PermissionsGuard`
   é deliberada e está em `auth.module.ts`. Alterar a ordem abre brechas de segurança.

---

## Ao terminar

Confirme que:
- [ ] `npm run build` no backend termina sem erros
- [ ] `npm run build` no frontend termina sem erros
- [ ] `npx prisma migrate status` mostra todas as migrations como "Applied"
- [ ] `curl http://localhost:3000/auth/login -X POST ...` retorna `200` com cookies
- [ ] `curl http://localhost:3000/auth/me` retorna `{ id, name, email, roleType, permissions }`
- [ ] `curl http://localhost:3000/leads` retorna `{ items: [], total: 0, ... }`
- [ ] `npm run dev` no frontend abre `http://localhost:5173` sem erros no console
- [ ] O login funciona na UI e a sidebar mostra o nome do usuário
