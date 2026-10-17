-- ============================================================================
-- ARQUIVO: rollback/013-doacoes-mercado-pago.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 013 (doações online pelo Mercado Pago): remove o
--   registro de webhooks, as colunas do gateway em doacoes, as assinaturas
--   (doações mensais) e volta a restrição de status das doações sem "falhou".
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE, DROP INDEX, ALTER TABLE ... DROP COLUMN / DROP CONSTRAINT / ADD CONSTRAINT.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/013-doacoes-mercado-pago.sql (aplicada; não comentada).
--   - Tabelas usadas por src/modules/donations/online-donation-repository.js.
-- ============================================================================

-- Reversão destrutiva da 013. Antes, troque o status "falhou" de doações existentes
-- (ex.: para "cancelada"), senão a restrição antiga não pode ser recriada.

-- Registro de webhooks recebidos.
DROP TABLE IF EXISTS gateway_webhook_eventos;
-- Índice único do id do pagamento no gateway.
DROP INDEX IF EXISTS uq_doacoes_gateway_pagamento;
-- Colunas do gateway em doacoes (assinatura_id sai antes da tabela de assinaturas, para a qual aponta).
ALTER TABLE doacoes
  DROP COLUMN IF EXISTS assinatura_id,
  DROP COLUMN IF EXISTS gateway_status,
  DROP COLUMN IF EXISTS gateway_pagamento_id,
  DROP COLUMN IF EXISTS gateway;
-- Doações mensais (assinaturas).
DROP TABLE IF EXISTS assinaturas_doacao;
-- Volta a restrição de status para os três valores antigos (sem "falhou").
ALTER TABLE doacoes DROP CONSTRAINT doacoes_status_check;
ALTER TABLE doacoes ADD CONSTRAINT doacoes_status_check CHECK (status IN ('pendente', 'confirmada', 'cancelada'));

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Webhooks → índice → colunas de doacoes (incluindo a chave estrangeira para
--   assinaturas) → assinaturas → restrição de status antiga.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Ordem de remoção com chaves estrangeiras.
--   - Recriar restrições CHECK: os dados atuais precisam respeitar a regra nova.
-- ============================================================================
