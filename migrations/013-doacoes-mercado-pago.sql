-- 013 — Doações pelo Mercado Pago: pagamento único (Checkout Pro), assinatura mensal (preapproval)
-- e webhooks. Substitui "gateway_webhook_eventos" proposta na 005 (aqui sem guardar o payload:
-- o estado do pagamento é sempre consultado na API do Mercado Pago).
-- Dados de cartão nunca passam pela API da ONG: o doador paga nas telas do Mercado Pago.

ALTER TABLE doacoes DROP CONSTRAINT doacoes_status_check;
ALTER TABLE doacoes ADD CONSTRAINT doacoes_status_check
  CHECK (status IN ('pendente', 'confirmada', 'cancelada', 'falhou'));

CREATE TABLE assinaturas_doacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doador_nome varchar(150) NOT NULL,
  doador_email varchar(150) NOT NULL,
  valor numeric(10, 2) NOT NULL CHECK (valor > 0),
  status varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativa', 'pausada', 'cancelada')),
  gateway varchar(30) NOT NULL DEFAULT 'mercado_pago',
  gateway_assinatura_id varchar(100) UNIQUE,
  -- Link de cancelamento enviado por e-mail ao doador (só o hash fica no banco).
  token_cancelamento_hash bytea UNIQUE,
  token_cancelamento_expira_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  cancelada_em timestamptz
);

CREATE INDEX idx_assinaturas_doacao_email ON assinaturas_doacao (lower(doador_email));

CREATE TRIGGER trg_assinaturas_doacao_atualizado
  BEFORE UPDATE ON assinaturas_doacao
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

ALTER TABLE doacoes
  ADD COLUMN gateway varchar(30),
  ADD COLUMN gateway_pagamento_id varchar(100),
  ADD COLUMN gateway_status varchar(40),
  ADD COLUMN assinatura_id uuid REFERENCES assinaturas_doacao(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_doacoes_gateway_pagamento ON doacoes (gateway, gateway_pagamento_id)
  WHERE gateway_pagamento_id IS NOT NULL;

-- Idempotência dos webhooks: a mesma notificação reenviada não é processada duas vezes.
CREATE TABLE gateway_webhook_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor varchar(30) NOT NULL,
  evento_externo_id varchar(200) NOT NULL,
  tipo varchar(60) NOT NULL,
  recurso_id varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'processado', 'falhou', 'ignorado')),
  codigo_erro varchar(80),
  recebido_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  UNIQUE (provedor, evento_externo_id)
);
