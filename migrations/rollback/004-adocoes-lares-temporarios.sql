-- ============================================================================
-- ARQUIVO: rollback/004-adocoes-lares-temporarios.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 004 (adoções e lares temporários): remove as tabelas
--   de lares temporários, acompanhamento pós-adoção e documentos do pedido, o
--   índice do protocolo e duas colunas de pedidos_adocao. Destrutivo.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE, DROP INDEX, ALTER TABLE ... DROP COLUMN.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/004-adocoes-lares-temporarios.sql.
-- ============================================================================

-- Reversao destrutiva da migration 004.
-- Exportar agenda, documentos e historico de lares antes de executar, se necessario.

-- Lares temporários (a tabela de ligação animal ↔ lar sai primeiro).
DROP TABLE IF EXISTS animais_lares_temporarios;
DROP TABLE IF EXISTS lares_temporarios;
-- Acompanhamento pós-adoção (mídias e contatos) e documentos do pedido.
DROP TABLE IF EXISTS pos_adocao_midias;
DROP TABLE IF EXISTS pos_adocao_contatos;
DROP TABLE IF EXISTS pedidos_adocao_documentos;

-- Índice único do protocolo do pedido.
DROP INDEX IF EXISTS uq_pedidos_adocao_protocolo;

-- Colunas adicionadas a pedidos_adocao.
ALTER TABLE pedidos_adocao
  DROP COLUMN IF EXISTS justificativa_decisao,
  DROP COLUMN IF EXISTS protocolo;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove as tabelas novas, o índice e, por último, as colunas extras.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Tabelas de ligação (muitos-para-muitos).
--   - Ordem de remoção: índices antes das colunas que eles usam.
-- ============================================================================
