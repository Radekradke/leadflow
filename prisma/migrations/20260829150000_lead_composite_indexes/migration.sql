-- This is an empty migration.
-- Índices compostos pra listagem de leads (funil/kanban): as consultas
-- reais sempre filtram por tenantId E (ordenam por createdAt OU filtram
-- por status) juntos — os índices de coluna única que já existiam não
-- servem pra essa combinação.
--
-- NOTA: em tabela grande e com tráfego de escrita real, o certo é
-- CREATE INDEX CONCURRENTLY (não trava leitura/escrita durante a
-- criação) rodado manualmente FORA de transação — o `prisma migrate
-- deploy` roda cada migration dentro de uma transação e CONCURRENTLY
-- não pode rodar dentro de uma. Hoje a tabela tem poucos leads (fase
-- de teste), então a versão simples é instantânea e segura.
CREATE INDEX IF NOT EXISTS "Lead_tenantId_createdAt_idx"
  ON "Lead" ("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Lead_tenantId_status_idx"
  ON "Lead" ("tenantId", "status");
