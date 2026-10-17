-- ============================================================================
-- ARQUIVO: rollback/011-agenda-adocao.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 011: remove a agenda de visitas/entrevistas dos
--   pedidos de adoção e a coluna da data preferida pelo adotante.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE e ALTER TABLE ... DROP COLUMN.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/011-agenda-adocao.sql (aplicada; não comentada).
--   - Tabela usada por src/modules/adoptions/appointment-repository.js.
-- ============================================================================

-- Reversão destrutiva da 011: apaga a agenda estruturada (o histórico de cada pedido mantém
-- as anotações de agendamento) e a data preferida informada pelos adotantes.

-- Agenda (compromissos).
DROP TABLE IF EXISTS pedidos_adocao_agendamentos;
-- Data/hora preferida para a visita.
ALTER TABLE pedidos_adocao DROP COLUMN IF EXISTS visita_preferida_em;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Apaga a tabela da agenda e a coluna nova de pedidos_adocao; as anotações de
--   texto no histórico dos pedidos continuam existindo.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Dados estruturados (tabela) x registro em texto (histórico).
-- ============================================================================
