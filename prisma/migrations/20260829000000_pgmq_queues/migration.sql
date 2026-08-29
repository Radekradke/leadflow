-- This is an empty migration.
-- Fila assíncrona (pgmq) — desacopla ingestão (webhook da Meta) de
-- processamento. `pgmq` cria seu próprio schema/tabelas; não é dado de
-- tenant, então NÃO leva RLS (mesma régua de qualquer extensão de infra).
--
-- Em alguns provedores gerenciados (Supabase incluso) habilitar a extensão
-- pode exigir o toggle em Database > Extensions no painel em vez de rodar
-- esta migration direto — se `CREATE EXTENSION` falhar por permissão,
-- habilite por lá e rode a migration de novo (idempotente).
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Só uma fila neste milestone: a distribuição continua síncrona quando
-- disparada por criação manual de lead (baixo volume, sem risco de rajada;
-- ver nota em lead.service.ts). Quem realmente precisa de fila é a ingestão
-- do webhook da Meta, que pode chegar em rajada durante pico de campanha.
SELECT pgmq.create('whatsapp_inbound');

