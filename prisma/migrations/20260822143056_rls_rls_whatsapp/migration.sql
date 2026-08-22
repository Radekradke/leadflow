-- This is an empty migration.-- ============================================================
--  Addendum de RLS para as tabelas de WhatsApp.
--  Aplique numa migration criada DEPOIS da que cria estas tabelas.
--
--  O WEBHOOK roda SEM contexto de tenant (a Meta chama direto), então
--  quem escreve a partir dele é o cliente ELEVADO (bypassa RLS),
--  resolvendo o tenant pelo phoneNumberId. As operações da APLICAÇÃO
--  (inbox do corretor) passam pela RLS normalmente.
-- ============================================================

ALTER TABLE "WhatsAppAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppAccount" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsAppAccount"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Conversation"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Message"
  USING      ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
