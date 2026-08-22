-- This is an empty migration.-- ============================================================
--  Sprint 2 — RLS das tabelas de domínio + integridade da atribuição.
--  Coloque numa migration (--create-only) criada DEPOIS da migration
--  que cria estas tabelas.
--
--  Toda tabela com tenantId recebe o MESMO trio (ENABLE + FORCE +
--  POLICY), igual ao núcleo. current_tenant_id() já existe da
--  migration de RLS inicial.
-- ============================================================

-- Department
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Department"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- Team
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Team"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- BrokerProfile
ALTER TABLE "BrokerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerProfile" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BrokerProfile"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- Queue
ALTER TABLE "Queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Queue" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Queue"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- QueueMembership
ALTER TABLE "QueueMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QueueMembership" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QueueMembership"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- Campaign
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Campaign"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- Lead
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lead"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- LeadAssignment
ALTER TABLE "LeadAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadAssignment" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeadAssignment"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- LeadTransfer
ALTER TABLE "LeadTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadTransfer" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeadTransfer"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- LeadStatusHistory
ALTER TABLE "LeadStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadStatusHistory" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeadStatusHistory"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- Interaction
ALTER TABLE "Interaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Interaction" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Interaction"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- Task
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Task"
  USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id());

-- ============================================================
--  INTEGRIDADE: no máximo UMA atribuição ativa por lead.
--  O Prisma não expressa índice único PARCIAL no schema, então vai aqui.
--  "Ativa" = endedAt IS NULL. Isto impede, no nível do banco, que um lead
--  tenha dois corretores responsáveis ao mesmo tempo — uma defesa real
--  contra a corrida de distribuição que veremos na Sprint 3.
-- ============================================================
CREATE UNIQUE INDEX "lead_one_active_assignment"
  ON "LeadAssignment" ("leadId")
  WHERE "endedAt" IS NULL;
