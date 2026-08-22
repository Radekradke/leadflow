#!/usr/bin/env bash
# ============================================================
#  LeadFlow — setup local automatizado (Parte A, passos 2 a 8)
#
#  Faz tudo: dependências, Postgres, papel de runtime, .env com
#  segredos gerados, migrations, RLS, permissões e seed.
#
#  Uso:   bash setup-local.sh
#
#  Pode rodar de novo sem medo: pula o que já está feito.
# ============================================================
set -euo pipefail

DB_CONTAINER="leadflow-db"
DB_NAME="leadflow"
DB_SUPERUSER="postgres"
DB_SUPERPASS="postgres"
APP_ROLE="leadflow_app"
APP_ROLE_PASS="leadflow_app"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
info() { printf '  \033[36m·\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$1" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

psql_run() { docker exec -i "$DB_CONTAINER" psql -U "$DB_SUPERUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1; }

# ── 0. Pré-requisitos ───────────────────────────────────────
step "0/7  Conferindo pré-requisitos"

command -v node    >/dev/null 2>&1 || die "Node não encontrado. Instale o Node 20 ou superior."
command -v npm     >/dev/null 2>&1 || die "npm não encontrado."
command -v docker  >/dev/null 2>&1 || die "Docker não encontrado. Instale o Docker e abra o Docker Desktop."
command -v openssl >/dev/null 2>&1 || die "openssl não encontrado."

NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) é antigo demais. Precisa ser 20 ou superior."
ok "Node $(node -v)"
if [ "$NODE_MAJOR" -ge 23 ]; then
  warn "Node $(node -v) é mais novo que o Prisma 5 deste projeto."
  info "Costuma funcionar. Se der erro de engine do Prisma adiante, instale o Node 22 LTS"
  info "(no Windows: https://github.com/coreybutler/nvm-windows → nvm install 22 && nvm use 22)"
fi

docker info >/dev/null 2>&1 || die "O Docker está instalado mas não está rodando. Abra o Docker Desktop e rode de novo."
ok "Docker rodando"

[ -f package.json ] || die "Rode este script de dentro da pasta do projeto (onde está o package.json)."
ok "Pasta do projeto correta"

# ── 1. Dependências ─────────────────────────────────────────
step "1/7  Instalando dependências"

if [ -d node_modules ]; then
  info "backend: node_modules já existe, pulando"
else
  npm install
  ok "backend instalado"
fi

if [ -d frontend/node_modules ]; then
  info "frontend: node_modules já existe, pulando"
else
  (cd frontend && npm install)
  ok "frontend instalado"
fi

# ── 2. Postgres ─────────────────────────────────────────────
step "2/7  Subindo o Postgres"

if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  ok "container '$DB_CONTAINER' já está rodando"
elif docker ps -a --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  docker start "$DB_CONTAINER" >/dev/null
  ok "container '$DB_CONTAINER' reiniciado"
else
  docker run --name "$DB_CONTAINER" \
    -e POSTGRES_PASSWORD="$DB_SUPERPASS" \
    -e POSTGRES_DB="$DB_NAME" \
    -p 5432:5432 \
    -d postgres:16-alpine >/dev/null
  ok "container '$DB_CONTAINER' criado"
fi

info "esperando o banco aceitar conexões..."
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U "$DB_SUPERUSER" -d "$DB_NAME" >/dev/null 2>&1; then
    ok "banco pronto"
    break
  fi
  [ "$i" -eq 30 ] && die "O Postgres não respondeu em 30s. Veja: docker logs $DB_CONTAINER"
  sleep 1
done

# ── 3. Papel de runtime (sem BYPASSRLS) ─────────────────────
step "3/7  Criando o papel de runtime ($APP_ROLE)"

psql_run >/dev/null << SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_ROLE') THEN
    CREATE ROLE $APP_ROLE LOGIN PASSWORD '$APP_ROLE_PASS';
  END IF;
END\$\$;

GRANT CONNECT ON DATABASE $DB_NAME TO $APP_ROLE;
GRANT USAGE ON SCHEMA public TO $APP_ROLE;
SQL
ok "papel '$APP_ROLE' pronto (sem BYPASSRLS — é ele que segura o isolamento)"

# ── 4. .env ─────────────────────────────────────────────────
step "4/7  Preparando o .env"

if [ -f .env ]; then
  warn ".env já existe — não vou sobrescrever."
  info "se der erro adiante, confira DATABASE_URL, APP_DATABASE_URL, JWT_ACCESS_SECRET e WHATSAPP_ENC_KEY"
else
  [ -f .env.example ] || die ".env.example não encontrado."
  cp .env.example .env

  JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  ENC_KEY="$(openssl rand -hex 32)"
  OWNER_URL="postgresql://$DB_SUPERUSER:$DB_SUPERPASS@localhost:5432/$DB_NAME?schema=public"
  APP_URL="postgresql://$APP_ROLE:$APP_ROLE_PASS@localhost:5432/$DB_NAME?schema=public"

  # '|' como separador: base64 e hex nunca contêm '|'
  sed -i.bak \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=\"$OWNER_URL\"|" \
    -e "s|^APP_DATABASE_URL=.*|APP_DATABASE_URL=\"$APP_URL\"|" \
    -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=\"$JWT_SECRET\"|" \
    -e "s|^WHATSAPP_ENC_KEY=.*|WHATSAPP_ENC_KEY=\"$ENC_KEY\"|" \
    -e "s|^WHATSAPP_DEV_MODE=.*|WHATSAPP_DEV_MODE=\"true\"|" \
    -e "s|^DEMO_ADMIN_PASSWORD=.*|DEMO_ADMIN_PASSWORD=\"Admin@12345\"|" \
    -e "s|^PLATFORM_ADMIN_PASSWORD=.*|PLATFORM_ADMIN_PASSWORD=\"Admin@12345\"|" \
    .env
  rm -f .env.bak

  ok ".env criado com segredos gerados"
  ok "modo simulação LIGADO (WHATSAPP_DEV_MODE=true)"
  warn "guarde a WHATSAPP_ENC_KEY: se ela mudar, os tokens salvos não descriptografam mais"
fi

# ── 5. Prisma: client + tabelas ─────────────────────────────
step "5/7  Gerando o Prisma e criando as tabelas"

npx prisma generate >/dev/null
ok "@prisma/client gerado"

npx prisma migrate dev --name init --skip-seed
ok "tabelas criadas"

# ── 6. RLS ──────────────────────────────────────────────────
step "6/7  Aplicando a segurança de linha (RLS)"

if ls -d prisma/migrations/*rls_core*/ >/dev/null 2>&1; then
  info "migrations de RLS já existem, pulando"
else
  for SQL_FILE in enable_rls.sql enable_rls_refresh_token.sql enable_rls_password_reset.sql \
                  enable_rls_audit_log.sql enable_rls_sprint2.sql enable_rls_distribution.sql \
                  enable_rls_whatsapp.sql enable_rls_adroute.sql; do
    [ -f "$SQL_FILE" ] || die "Arquivo $SQL_FILE não encontrado na raiz do projeto."
    NAME="$(echo "$SQL_FILE" | sed 's/\.sql//' | sed 's/enable_/rls_/')"
    npx prisma migrate dev --create-only --name "$NAME" --skip-seed >/dev/null
    LATEST="$(ls -d prisma/migrations/*/ | sort | tail -1)"
    cat "$SQL_FILE" >> "${LATEST}migration.sql"
    npx prisma migrate dev --skip-seed >/dev/null
    ok "$SQL_FILE aplicado"
  done
fi

info "liberando permissões nas tabelas para $APP_ROLE"
psql_run >/dev/null << SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $APP_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $APP_ROLE;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $APP_ROLE;
SQL
ok "permissões aplicadas"

# ── 7. Seed ─────────────────────────────────────────────────
step "7/7  Criando o primeiro admin"

npx prisma db seed
ok "seed concluído"

# ── Fim ─────────────────────────────────────────────────────
cat << 'FIM'

────────────────────────────────────────────────────────────
  Pronto. Agora abra DOIS terminais:

    Terminal 1:   npm run start:dev
    Terminal 2:   cd frontend && npm run dev

  Depois abra   http://localhost:5173
  Login:        admin@demo.local
  Senha:        Admin@12345

  Teste o ciclo: Atendimento → "Simular lead" → responda a conversa.
────────────────────────────────────────────────────────────

FIM
