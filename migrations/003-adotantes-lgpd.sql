-- Migration aditiva: protecao de CPF, consentimentos e solicitacoes LGPD.
-- A chave de cifragem deve permanecer fora do banco, em secret manager da aplicacao.
-- Rollback correspondente: migrations/rollback/003-adotantes-lgpd.sql.

ALTER TABLE adotantes
  ADD COLUMN IF NOT EXISTS cpf_cifrado bytea,
  ADD COLUMN IF NOT EXISTS cpf_nonce bytea,
  ADD COLUMN IF NOT EXISTS cpf_tag_autenticacao bytea,
  ADD COLUMN IF NOT EXISTS cpf_hash_busca bytea,
  ADD COLUMN IF NOT EXISTS cpf_versao_chave smallint,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS dados_endereco jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS anonimizado_em timestamptz;

ALTER TABLE adotantes
  ADD CONSTRAINT ck_adotantes_cpf_cifrado_completo
  CHECK (
    (cpf_cifrado IS NULL AND cpf_nonce IS NULL AND cpf_tag_autenticacao IS NULL
      AND cpf_hash_busca IS NULL AND cpf_versao_chave IS NULL)
    OR
    (cpf_cifrado IS NOT NULL AND cpf_nonce IS NOT NULL AND cpf_tag_autenticacao IS NOT NULL
      AND cpf_hash_busca IS NOT NULL AND cpf_versao_chave IS NOT NULL AND cpf_versao_chave > 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_adotantes_cpf_hash_busca
  ON adotantes (cpf_hash_busca)
  WHERE cpf_hash_busca IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adotantes_nome_busca
  ON adotantes (LOWER(nome));

CREATE INDEX IF NOT EXISTS idx_adotantes_telefone_busca
  ON adotantes (telefone)
  WHERE telefone IS NOT NULL;

CREATE TABLE pedidos_adocao_respostas (
  pedido_id uuid PRIMARY KEY REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  residencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotina jsonb NOT NULL DEFAULT '{}'::jsonb,
  outros_animais jsonb NOT NULL DEFAULT '[]'::jsonb,
  consentimento_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consentimentos_lgpd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adotante_id uuid NOT NULL REFERENCES adotantes(id) ON DELETE RESTRICT,
  finalidade varchar(120) NOT NULL,
  versao_termo varchar(60) NOT NULL,
  concedido_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  ip inet,
  agente_usuario text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (revogado_em IS NULL OR revogado_em >= concedido_em)
);

ALTER TABLE pedidos_adocao_respostas
  ADD CONSTRAINT fk_pedidos_adocao_respostas_consentimento
  FOREIGN KEY (consentimento_id) REFERENCES consentimentos_lgpd(id) ON DELETE SET NULL;

CREATE INDEX idx_consentimentos_lgpd_adotante_data
  ON consentimentos_lgpd (adotante_id, concedido_em DESC);

CREATE TABLE solicitacoes_lgpd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adotante_id uuid NOT NULL REFERENCES adotantes(id) ON DELETE RESTRICT,
  tipo varchar(20) NOT NULL CHECK (tipo IN ('exportar', 'anonimizar', 'excluir')),
  status varchar(20) NOT NULL DEFAULT 'recebida'
    CHECK (status IN ('recebida', 'em_andamento', 'concluida', 'recusada')),
  protocolo varchar(40) NOT NULL UNIQUE,
  justificativa text,
  solicitada_em timestamptz NOT NULL DEFAULT now(),
  prazo_em timestamptz,
  concluida_em timestamptz,
  arquivo_objeto_chave varchar(500),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_solicitacoes_lgpd_status_prazo
  ON solicitacoes_lgpd (status, prazo_em);

CREATE INDEX idx_solicitacoes_lgpd_adotante_data
  ON solicitacoes_lgpd (adotante_id, solicitada_em DESC);