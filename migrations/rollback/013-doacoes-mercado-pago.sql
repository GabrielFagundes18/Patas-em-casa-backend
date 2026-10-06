-- Reversão destrutiva da 013. Antes, troque o status "falhou" de doações existentes
-- (ex.: para "cancelada"), senão a restrição antiga não pode ser recriada.

DROP TABLE IF EXISTS gateway_webhook_eventos;
DROP INDEX IF EXISTS uq_doacoes_gateway_pagamento;
ALTER TABLE doacoes
  DROP COLUMN IF EXISTS assinatura_id,
  DROP COLUMN IF EXISTS gateway_status,
  DROP COLUMN IF EXISTS gateway_pagamento_id,
  DROP COLUMN IF EXISTS gateway;
DROP TABLE IF EXISTS assinaturas_doacao;
ALTER TABLE doacoes DROP CONSTRAINT doacoes_status_check;
ALTER TABLE doacoes ADD CONSTRAINT doacoes_status_check CHECK (status IN ('pendente', 'confirmada', 'cancelada'));
