-- ============================================================================
-- ARQUIVO: rollback/002-animais-prontuario.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 002 (prontuário dos animais): remove as tabelas de
--   vacinas, procedimentos veterinários, medicações, histórico de status e o
--   catálogo de status adicionais, além de duas colunas da tabela animais.
--   Destrutivo: apaga os dados veterinários.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE e ALTER TABLE ... DROP COLUMN.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/002-animais-prontuario.sql.
-- ============================================================================

-- Reversao destrutiva da migration 002.
-- Executar somente apos exportar os dados veterinarios e de midia, se necessario.

-- Tabelas do prontuário.
DROP TABLE IF EXISTS status_animal_adicionais_catalogo;
DROP TABLE IF EXISTS animais_medicacoes;
DROP TABLE IF EXISTS animais_procedimentos_veterinarios;
DROP TABLE IF EXISTS animais_vacinas;
DROP TABLE IF EXISTS animais_status_historico;

-- Colunas extras da tabela animais (um único ALTER TABLE com vários DROP COLUMN separados por vírgula).
ALTER TABLE animais
  DROP COLUMN IF EXISTS historia_resgate,
  DROP COLUMN IF EXISTS necessidades_especiais;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Apaga as tabelas do prontuário e, depois, remove as colunas adicionadas à
--   tabela animais.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - ALTER TABLE ... DROP COLUMN IF EXISTS.
--   - Exportar dados antes de operações destrutivas.
-- ============================================================================
