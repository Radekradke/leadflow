-- RLS da tabela de roteamento por anúncio.
ALTER TABLE "AdRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdRoute" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AdRoute"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
