-- ============================================================================
-- ARQUIVO: rollback/006-voluntarios-eventos.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 006 (voluntários e eventos): remove as tabelas de
--   eventos, o índice de triagem e as colunas extras de voluntários
--   (disponibilidade, veículo, habilidades, status da triagem). Destrutivo.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE, DROP INDEX, ALTER TABLE ... DROP COLUMN.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/006-voluntarios-eventos.sql.
-- ============================================================================

-- Reversao destrutiva da migration 006.

-- Tabelas de ligação (evento ↔ voluntário, evento ↔ animal) e a de eventos.
DROP TABLE IF EXISTS eventos_voluntarios;
DROP TABLE IF EXISTS eventos_animais;
DROP TABLE IF EXISTS eventos;

-- Índice da triagem de voluntários.
DROP INDEX IF EXISTS idx_voluntarios_triagem;

-- Colunas adicionadas a voluntarios.
ALTER TABLE voluntarios
  DROP COLUMN IF EXISTS status_triagem,
  DROP COLUMN IF EXISTS habilidades,
  DROP COLUMN IF EXISTS possui_veiculo,
  DROP COLUMN IF EXISTS disponibilidade;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Tabelas de eventos → índice → colunas extras de voluntarios.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Relações muitos-para-muitos com tabelas de ligação.
-- ============================================================================
