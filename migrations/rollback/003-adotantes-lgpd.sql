-- ============================================================================
-- ARQUIVO: rollback/003-adotantes-lgpd.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 003 (adotantes e LGPD): remove as tabelas de
--   solicitações e consentimentos LGPD e de respostas do formulário, a
--   restrição e os índices do CPF e as colunas extras de adotantes (CPF
--   cifrado, data de nascimento, endereço estruturado...). Destrutivo.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE, ALTER TABLE ... DROP CONSTRAINT / DROP COLUMN, DROP INDEX.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/003-adotantes-lgpd.sql.
-- ============================================================================

-- Reversao destrutiva da migration 003.
-- Descartara CPFs cifrados, hashes e registros LGPD; exportar antes, se necessario.

-- Tabelas criadas pela 003.
DROP TABLE IF EXISTS solicitacoes_lgpd;
DROP TABLE IF EXISTS consentimentos_lgpd;
DROP TABLE IF EXISTS pedidos_adocao_respostas;

-- Restrição que exigia que todas as partes do CPF cifrado estivessem juntas.
ALTER TABLE adotantes
  DROP CONSTRAINT IF EXISTS ck_adotantes_cpf_cifrado_completo;

-- Índices de busca (telefone, nome) e o índice único do hash do CPF.
DROP INDEX IF EXISTS idx_adotantes_telefone_busca;
DROP INDEX IF EXISTS idx_adotantes_nome_busca;
DROP INDEX IF EXISTS uq_adotantes_cpf_hash_busca;

-- Colunas adicionadas a adotantes (o CPF era guardado cifrado: texto cifrado, nonce, tag e versão da chave).
ALTER TABLE adotantes
  DROP COLUMN IF EXISTS anonimizado_em,
  DROP COLUMN IF EXISTS dados_endereco,
  DROP COLUMN IF EXISTS data_nascimento,
  DROP COLUMN IF EXISTS cpf_versao_chave,
  DROP COLUMN IF EXISTS cpf_hash_busca,
  DROP COLUMN IF EXISTS cpf_tag_autenticacao,
  DROP COLUMN IF EXISTS cpf_nonce,
  DROP COLUMN IF EXISTS cpf_cifrado;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Tabelas → restrição → índices → colunas: remove primeiro o que depende das
--   colunas, depois as próprias colunas.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Criptografia de dados pessoais (cifra autenticada: nonce + tag) e hash para busca.
--   - Restrições CHECK, índices e índices únicos.
--   - LGPD: consentimentos e solicitações do titular.
-- ============================================================================
