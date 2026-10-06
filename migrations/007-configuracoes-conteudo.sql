-- Migration aditiva: configuracoes da ONG, gateway e conteudo versionado.
-- Segredos devem ser cifrados pela aplicacao antes da persistencia.
-- Rollback correspondente: migrations/rollback/007-configuracoes-conteudo.sql.

CREATE TABLE configuracoes_ong (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome varchar(180) NOT NULL,
  cnpj varchar(18),
  endereco jsonb NOT NULL DEFAULT '{}'::jsonb,
  contatos_publicos jsonb NOT NULL DEFAULT '{}'::jsonb,
  chaves_pix_cifradas bytea,
  chaves_pix_nonce bytea,
  chaves_pix_tag bytea,
  versao_chave smallint CHECK (versao_chave IS NULL OR versao_chave > 0),
  atualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE configuracoes_gateway (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor varchar(60) NOT NULL UNIQUE,
  configuracao_publica jsonb NOT NULL DEFAULT '{}'::jsonb,
  segredos_cifrados bytea NOT NULL,
  nonce bytea NOT NULL,
  tag_autenticacao bytea NOT NULL,
  versao_chave smallint NOT NULL CHECK (versao_chave > 0),
  ativo boolean NOT NULL DEFAULT false,
  atualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paginas_institucionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(100) NOT NULL UNIQUE,
  titulo varchar(180) NOT NULL,
  descricao_seo varchar(320),
  conteudo_atual jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao_atual integer NOT NULL DEFAULT 1 CHECK (versao_atual > 0),
  publicado boolean NOT NULL DEFAULT false,
  atualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paginas_institucionais_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagina_id uuid NOT NULL REFERENCES paginas_institucionais(id) ON DELETE CASCADE,
  versao integer NOT NULL CHECK (versao > 0),
  titulo varchar(180) NOT NULL,
  descricao_seo varchar(320),
  conteudo jsonb NOT NULL,
  publicado boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pagina_versao UNIQUE (pagina_id, versao)
);

CREATE INDEX idx_paginas_versoes_historico
  ON paginas_institucionais_versoes (pagina_id, versao DESC);

CREATE TABLE modo_manutencao (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo boolean NOT NULL DEFAULT false,
  mensagem_publica varchar(500),
  iniciado_em timestamptz,
  atualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);