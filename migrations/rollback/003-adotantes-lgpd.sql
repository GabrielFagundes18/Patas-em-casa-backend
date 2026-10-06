-- Reversao destrutiva da migration 003.
-- Descartara CPFs cifrados, hashes e registros LGPD; exportar antes, se necessario.

DROP TABLE IF EXISTS solicitacoes_lgpd;
DROP TABLE IF EXISTS consentimentos_lgpd;
DROP TABLE IF EXISTS pedidos_adocao_respostas;

ALTER TABLE adotantes
  DROP CONSTRAINT IF EXISTS ck_adotantes_cpf_cifrado_completo;

DROP INDEX IF EXISTS idx_adotantes_telefone_busca;
DROP INDEX IF EXISTS idx_adotantes_nome_busca;
DROP INDEX IF EXISTS uq_adotantes_cpf_hash_busca;

ALTER TABLE adotantes
  DROP COLUMN IF EXISTS anonimizado_em,
  DROP COLUMN IF EXISTS dados_endereco,
  DROP COLUMN IF EXISTS data_nascimento,
  DROP COLUMN IF EXISTS cpf_versao_chave,
  DROP COLUMN IF EXISTS cpf_hash_busca,
  DROP COLUMN IF EXISTS cpf_tag_autenticacao,
  DROP COLUMN IF EXISTS cpf_nonce,
  DROP COLUMN IF EXISTS cpf_cifrado;