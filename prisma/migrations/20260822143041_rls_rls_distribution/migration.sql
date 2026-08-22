-- This is an empty migration.-- RLS para DistributionLog (Sprint 3).
-- Mesmo padrão obrigatório de toda tabela com tenantId: ENABLE + FORCE + POLICY.
-- A Queue ganhou colunas novas, mas já tinha RLS (enable_rls_sprint2.sql);
-- colunas adicionais são cobertas automaticamente — não precisa mexer nela.
--
-- Rode via:  npx prisma migrate dev --create-only --name rls_distribution_log
-- e cole este conteúdo no migration.sql gerado (depois migrate dev p/ aplicar).

ALTER TABLE "DistributionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DistributionLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "DistributionLog"
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
