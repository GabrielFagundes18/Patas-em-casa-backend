-- Migration aditiva: agenda, justificativas, documentos, pos-adocao e lares temporarios.
-- Rollback correspondente: migrations/rollback/004-adocoes-lares-temporarios.sql.

ALTER TABLE pedidos_adocao
  ADD COLUMN IF NOT EXISTS protocolo varchar(40),
  ADD COLUMN IF NOT EXISTS justificativa_decisao text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_adocao_protocolo
  ON pedidos_adocao (protocolo)
  WHERE protocolo IS NOT NULL;

CREATE TABLE pedidos_adocao_agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  tipo varchar(20) NOT NULL CHECK (tipo IN ('entrevista', 'visita')),
  status varchar(20) NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'realizado', 'cancelado')),
  previsto_em timestamptz NOT NULL,
  responsavel_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  anotacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_agendamentos_data_status
  ON pedidos_adocao_agendamentos (previsto_em, status);

CREATE INDEX idx_pedidos_agendamentos_responsavel
  ON pedidos_adocao_agendamentos (responsavel_id, previsto_em);

CREATE TABLE pedidos_adocao_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  tipo varchar(30) NOT NULL CHECK (tipo IN ('termo_gerado', 'termo_assinado', 'outro')),
  objeto_chave varchar(500) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_documentos_pedido_data
  ON pedidos_adocao_documentos (pedido_id, criado_em DESC);

CREATE TABLE pos_adocao_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  previsto_em timestamptz NOT NULL,
  realizado_em timestamptz,
  retorno text,
  responsavel_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_adocao_contatos_pendentes
  ON pos_adocao_contatos (previsto_em)
  WHERE realizado_em IS NULL;

CREATE TABLE pos_adocao_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  objeto_chave varchar(500) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lares_temporarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voluntario_id uuid NOT NULL REFERENCES voluntarios(id) ON DELETE RESTRICT,
  capacidade smallint NOT NULL CHECK (capacidade > 0),
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE animais_lares_temporarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE RESTRICT,
  lar_temporario_id uuid NOT NULL REFERENCES lares_temporarios(id) ON DELETE RESTRICT,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_em timestamptz,
  motivo text,
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  CHECK (encerrado_em IS NULL OR encerrado_em >= iniciado_em)
);

CREATE UNIQUE INDEX uq_animais_lar_temporario_ativo
  ON animais_lares_temporarios (animal_id)
  WHERE encerrado_em IS NULL;

CREATE INDEX idx_animais_lares_temporarios_historico
  ON animais_lares_temporarios (animal_id, iniciado_em DESC);