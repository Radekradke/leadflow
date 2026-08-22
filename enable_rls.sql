-- ============================================================
--  LeadFlow Imobiliário — Migration: enable_rls
--  Row-Level Security (RLS): o isolamento entre tenants no nível
--  do BANCO. É a segunda parede, independente do código da app.
--
--  Modelo de papéis (roles) assumido aqui:
--   • Papel de MIGRATION/SEED  -> é o usuário do DATABASE_URL que o
--     Prisma usa. Deve ter BYPASSRLS (a maioria dos provedores
--     gerenciados já dá isso ao usuário principal). Ele NÃO é
--     barrado pelas políticas — por isso seed e migrations rodam
--     livres.
--   • Papel de RUNTIME (leadflow_app) -> a app NestJS conecta com
--     ele em produção. NÃO tem BYPASSRLS e NÃO é dono das tabelas,
--     logo as políticas SE APLICAM a ele. É o que segura o vazamento.
--
--  Pré-requisito: o papel leadflow_app já existe (ver bloco no fim
--  deste arquivo — rode aquilo UMA vez, fora do controle de versão,
--  porque contém senha).
-- ============================================================

-- ── 1) Permissões do papel de runtime ──────────────────────
-- Sem isto, leadflow_app não enxerga nem o schema nem as tabelas.
GRANT USAGE ON SCHEMA public TO leadflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leadflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leadflow_app;

-- Tabelas/sequences criadas nas PRÓXIMAS migrations já nascem
-- acessíveis ao app, sem precisar repetir GRANT toda vez.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO leadflow_app;

-- ── 2) A "variável de sessão" do tenant ─────────────────────
-- O app, no início de cada transação, executa:
--     SELECT set_config('app.current_tenant', '<tenantId>', true);
-- O 'true' final torna o valor LOCAL à transação (não vaza para a
-- próxima requisição que reusar a mesma conexão do pool).
--
-- Esta função só encapsula a leitura desse valor. O segundo
-- argumento de current_setting (true = missing_ok) faz retornar
-- NULL quando NADA foi setado — em vez de dar erro. NULL aqui
-- significa "nenhum tenant no contexto" => nenhuma linha casa a
-- política => retorno VAZIO. Ou seja: falha fechada (fail-closed).
-- Esquecer de setar o tenant vira "lista vazia" (bug óbvio e
-- inofensivo), nunca "dados de todo mundo" (vazamento).
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.current_tenant', true) $$;

-- ── 3) Ativar RLS em cada tabela com escopo de tenant ───────
-- ENABLE liga a RLS. FORCE garante que NEM O DONO da tabela
-- escape da política (cinto + suspensório). O papel de seed/
-- migration continua livre porque usa BYPASSRLS, que vence o FORCE.
--
-- USING       -> filtra o que pode ser LIDO/alterado/excluído.
-- WITH CHECK  -> impede INSERT/UPDATE gravando linha de OUTRO tenant.

-- Tenant: a própria linha da imobiliária. Aqui a chave é "id".
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING      ("id" = current_tenant_id())
  WITH CHECK ("id" = current_tenant_id());

-- User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Role
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- RolePermission (usa o tenantId denormalizado — por isso a
-- política é idêntica às demais)
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RolePermission"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- ── NOTA: Plan e PlatformAdmin NÃO recebem RLS de tenant ────
-- Plan é catálogo global (planos são "públicos"). PlatformAdmin é
-- o plano da plataforma (sem tenant). Ambos só são tocados pelo
-- cliente Prisma ELEVADO (conexão de migration/owner) do módulo de
-- plataforma — nunca pela conexão de runtime dos tenants.

-- ============================================================
--  NÃO COMMITAR O BLOCO ABAIXO COM SENHA REAL.
--  Rode UMA vez por ambiente, conectado como administrador do
--  banco, trocando a senha por um segredo do seu cofre/.env:
--
--    CREATE ROLE leadflow_app LOGIN
--      PASSWORD 'TROQUE-POR-SENHA-FORTE'
--      NOBYPASSRLS;
--
--  E garanta que o usuário do DATABASE_URL (migration/seed)
--  tenha BYPASSRLS. Se o provedor não der por padrão e você for
--  superusuário:
--
--    ALTER ROLE "<usuario_do_DATABASE_URL>" BYPASSRLS;
-- ============================================================
