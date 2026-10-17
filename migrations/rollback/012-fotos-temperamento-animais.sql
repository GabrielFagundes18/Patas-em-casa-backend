-- ============================================================================
-- ARQUIVO: rollback/012-fotos-temperamento-animais.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 012: remove a galeria de fotos dos animais (registro
--   no banco) e a coluna de temperamento.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE e ALTER TABLE ... DROP COLUMN.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/012-fotos-temperamento-animais.sql (aplicada; não comentada).
--   - Tabela usada por src/modules/animals/animal-media-repository.js.
-- ============================================================================

-- Reversão destrutiva da 012: apaga o registro da galeria e o temperamento.
-- Os arquivos em UPLOAD_DIR/animais não são apagados; foto_url de cada animal continua valendo.

-- Galeria de fotos.
DROP TABLE IF EXISTS animais_midias;
-- Lista de traços de temperamento.
ALTER TABLE animais DROP COLUMN IF EXISTS temperamento;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove a tabela da galeria e a coluna temperamento; os arquivos de imagem no
--   disco ficam onde estão.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Diferença entre o registro no banco e o arquivo no disco (storage).
-- ============================================================================
