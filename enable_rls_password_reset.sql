-- ============================================================
--  Addendum de RLS para PasswordResetToken.
--  Aplique numa migration (--create-only) criada DEPOIS da
--  migration que cria a tabela PasswordResetToken.
--
--  Como o fluxo de reset roda SEM contexto de tenant (o usuário
--  ainda não está logado), na prática quem toca esta tabela é o
--  cliente ELEVADO (bypassa RLS). A política existe como defesa
--  em profundidade e para manter a regra "toda tabela com
--  tenantId tem RLS".
-- ============================================================

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordResetToken"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
