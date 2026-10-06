-- Reversao destrutiva da migration 004.
-- Exportar agenda, documentos e historico de lares antes de executar, se necessario.

DROP TABLE IF EXISTS animais_lares_temporarios;
DROP TABLE IF EXISTS lares_temporarios;
DROP TABLE IF EXISTS pos_adocao_midias;
DROP TABLE IF EXISTS pos_adocao_contatos;
DROP TABLE IF EXISTS pedidos_adocao_documentos;
DROP TABLE IF EXISTS pedidos_adocao_agendamentos;

DROP INDEX IF EXISTS uq_pedidos_adocao_protocolo;

ALTER TABLE pedidos_adocao
  DROP COLUMN IF EXISTS justificativa_decisao,
  DROP COLUMN IF EXISTS protocolo;