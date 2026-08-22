-- This is an empty migration.-- ============================================================
--  Addendum de RLS para a tabela AuditLog.
--  Coloque numa migration (--create-only) criada DEPOIS da migration
--  que cria AuditLog.
--
--  Como tenantId é NULLABLE:
--   - Linhas COM tenantId  -> visíveis só para aquele tenant (reads).
--   - Linhas SEM tenantId   -> eventos de plataforma/anônimos; nunca
--     casam a política, logo ficam invisíveis para qualquer tenant.
--   - Escritas vêm do cliente ELEVADO (bypassa o WITH CHECK).
--   - Leitura de plataforma usa o cliente elevado (vê tudo).
-- ============================================================

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
