-- Migration aditiva: apadrinhamento, prestacao de contas, necessidades e webhooks.
-- Payloads de webhook devem ser cifrados pela aplicacao antes de serem gravados.
-- Rollback correspondente: migrations/rollback/005-financeiro-apadrinhamento.sql.

CREATE TABLE apadrinhamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adotante_id uuid REFERENCES adotantes(id) ON DELETE SET NULL,
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE RESTRICT,
  padrinho_nome varchar(150) NOT NULL,
  padrinho_email varchar(150),
  valor_mensal numeric(10,2) NOT NULL CHECK (valor_mensal > 0),
  iniciado_em date NOT NULL DEFAULT CURRENT_DATE,
  encerrado_em date,
  status varchar(20) NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'pausado', 'encerrado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (encerrado_em IS NULL OR encerrado_em >= iniciado_em)
);

CREATE INDEX idx_apadrinhamentos_animal_status
  ON apadrinhamentos (animal_id, status);

CREATE INDEX idx_apadrinhamentos_adotante
  ON apadrinhamentos (adotante_id)
  WHERE adotante_id IS NOT NULL;

CREATE TABLE apadrinhamentos_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apadrinhamento_id uuid NOT NULL REFERENCES apadrinhamentos(id) ON DELETE RESTRICT,
  doacao_id uuid REFERENCES doacoes(id) ON DELETE SET NULL,
  referencia date NOT NULL,
  vence_em date NOT NULL,
  pago_em timestamptz,
  status varchar(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'paga', 'atrasada', 'cancelada')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_apadrinhamento_cobranca_referencia UNIQUE (apadrinhamento_id, referencia)
);

CREATE INDEX idx_apadrinhamentos_cobrancas_vencidas
  ON apadrinhamentos_cobrancas (vence_em)
  WHERE status IN ('pendente', 'atrasada');

CREATE TABLE financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo varchar(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria varchar(100) NOT NULL,
  descricao varchar(300) NOT NULL,
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  ocorrido_em timestamptz NOT NULL,
  comprovante_objeto_chave varchar(500),
  publicado boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_financeiro_lancamentos_publicos_data
  ON financeiro_lancamentos (ocorrido_em DESC)
  WHERE publicado = true;

CREATE INDEX idx_financeiro_lancamentos_categoria_data
  ON financeiro_lancamentos (categoria, ocorrido_em DESC);

CREATE TABLE necessidades_fisicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(160) NOT NULL,
  descricao text,
  categoria varchar(80) NOT NULL,
  quantidade_necessaria numeric(10,2) NOT NULL CHECK (quantidade_necessaria > 0),
  quantidade_recebida numeric(10,2) NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0),
  unidade varchar(40) NOT NULL,
  prioridade varchar(10) NOT NULL CHECK (prioridade IN ('alto', 'medio', 'baixo')),
  status varchar(20) NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'parcial', 'atendida', 'cancelada')),
  publicado boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_necessidades_publicas_status
  ON necessidades_fisicas (status, prioridade)
  WHERE publicado = true;

CREATE TABLE gateway_webhook_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor varchar(60) NOT NULL,
  evento_externo_id varchar(200) NOT NULL,
  doacao_id uuid REFERENCES doacoes(id) ON DELETE SET NULL,
  payload_cifrado bytea NOT NULL,
  payload_nonce bytea NOT NULL,
  payload_tag_autenticacao bytea NOT NULL,
  versao_chave smallint NOT NULL CHECK (versao_chave > 0),
  status varchar(20) NOT NULL DEFAULT 'recebido'
    CHECK (status IN ('recebido', 'processando', 'processado', 'falhou')),
  codigo_erro varchar(80),
  recebido_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  CONSTRAINT uq_gateway_evento_provedor_id UNIQUE (provedor, evento_externo_id)
);

CREATE INDEX idx_gateway_webhook_eventos_reprocessamento
  ON gateway_webhook_eventos (recebido_em)
  WHERE status = 'falhou';