-- 010 — Sessões revogáveis e links de redefinição de senha / convite.
-- Substitui as tabelas "sessoes", "tokens_renovacao" e "tokens_redefinicao_acesso" propostas na 001.
-- O cookie de renovação passa a carregar o id da sessão: logout, troca de senha e desativação
-- revogam a sessão no banco, e não apenas no navegador.

CREATE TABLE sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  agente_usuario varchar(500),
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  revogado_em timestamptz
);

CREATE INDEX idx_sessoes_usuario_ativas ON sessoes (usuario_id) WHERE revogado_em IS NULL;

-- Só o hash SHA-256 do token fica no banco; o token em si só existe no link enviado por e-mail.
CREATE TABLE tokens_redefinicao_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  finalidade varchar(20) NOT NULL CHECK (finalidade IN ('redefinicao', 'convite')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  usado_em timestamptz
);

CREATE INDEX idx_tokens_redefinicao_pendentes ON tokens_redefinicao_acesso (usuario_id) WHERE usado_em IS NULL;
