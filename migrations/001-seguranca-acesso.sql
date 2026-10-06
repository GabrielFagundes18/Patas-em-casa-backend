-- Migration aditiva: estruturas de autenticacao e sessao.
-- Requer pgcrypto, ja previsto no schema-base.
-- Rollback correspondente: migrations/rollback/001-seguranca-acesso.sql.

CREATE TABLE tentativas_login (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_conta_hash bytea NOT NULL,
  ip inet NOT NULL,
  falhas integer NOT NULL DEFAULT 1 CHECK (falhas >= 0),
  bloqueado_ate timestamptz,
  primeira_tentativa_em timestamptz NOT NULL DEFAULT now(),
  ultima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tentativas_login_conta_ip UNIQUE (chave_conta_hash, ip)
);

CREATE INDEX idx_tentativas_login_bloqueado_ate
  ON tentativas_login (bloqueado_ate)
  WHERE bloqueado_ate IS NOT NULL;

CREATE TABLE usuarios_totp (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  segredo_cifrado bytea NOT NULL,
  nonce bytea NOT NULL,
  tag_autenticacao bytea NOT NULL,
  versao_chave smallint NOT NULL DEFAULT 1 CHECK (versao_chave > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  confirmado_em timestamptz
);

CREATE TABLE codigos_recuperacao_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash bytea NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz,
  CONSTRAINT uq_codigos_recuperacao_2fa_hash UNIQUE (usuario_id, codigo_hash)
);

CREATE INDEX idx_codigos_recuperacao_2fa_disponiveis
  ON codigos_recuperacao_2fa (usuario_id)
  WHERE usado_em IS NULL;

CREATE TABLE desafios_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  tentativas smallint NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  usado_em timestamptz
);

CREATE INDEX idx_desafios_2fa_expiracao
  ON desafios_2fa (expira_em)
  WHERE usado_em IS NULL;

CREATE TABLE sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dispositivo varchar(200),
  ip inet NOT NULL,
  agente_usuario text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  revogado_em timestamptz
);

CREATE INDEX idx_sessoes_usuario_ativas
  ON sessoes (usuario_id, ultimo_uso_em DESC)
  WHERE revogado_em IS NULL;

CREATE INDEX idx_sessoes_expiracao
  ON sessoes (expira_em)
  WHERE revogado_em IS NULL;

CREATE TABLE tokens_renovacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  revogado_em timestamptz,
  substituido_por uuid REFERENCES tokens_renovacao(id) ON DELETE SET NULL
);

CREATE INDEX idx_tokens_renovacao_sessao_ativos
  ON tokens_renovacao (sessao_id, expira_em)
  WHERE revogado_em IS NULL;

CREATE TABLE tokens_redefinicao_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  usado_em timestamptz
);

CREATE INDEX idx_tokens_redefinicao_pendentes
  ON tokens_redefinicao_acesso (expira_em)
  WHERE usado_em IS NULL;

CREATE TABLE auditoria_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  cargo varchar(50),
  acao varchar(80) NOT NULL,
  modulo varchar(80) NOT NULL,
  entidade varchar(100),
  entidade_id uuid,
  ip inet,
  agente_usuario text,
  valores_antes jsonb,
  valores_depois jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_eventos_data
  ON auditoria_eventos (criado_em DESC);

CREATE INDEX idx_auditoria_eventos_usuario_data
  ON auditoria_eventos (usuario_id, criado_em DESC);

CREATE INDEX idx_auditoria_eventos_entidade
  ON auditoria_eventos (entidade, entidade_id, criado_em DESC);

CREATE OR REPLACE FUNCTION bloquear_mutacao_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Eventos de auditoria são imutáveis.';
END;
$$;

CREATE TRIGGER trg_auditoria_eventos_imutaveis
  BEFORE UPDATE OR DELETE ON auditoria_eventos
  FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao_auditoria();