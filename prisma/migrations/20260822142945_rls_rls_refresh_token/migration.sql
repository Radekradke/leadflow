-- This is an empty migration.-- ============================================================
--  Addendum de RLS para a tabela RefreshToken.
--  Adicione estas linhas numa migration (--create-only) criada
--  DEPOIS da migration que cria a tabela RefreshToken.
--
--  Observação: na prática esta tabela é tocada apenas pelo cliente
--  ELEVADO (login/refresh/logout não têm contexto de tenant), que
--  bypassa a RLS. A política existe como DEFESA EM PROFUNDIDADE e
--  para manter a regra "toda tabela com tenantId tem RLS".
-- ============================================================

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshToken"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
