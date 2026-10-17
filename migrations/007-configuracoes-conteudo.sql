-- ============================================================================
-- ARQUIVO: 007-configuracoes-conteudo.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration de CONFIGURAÇÕES e CONTEÚDO: dados da ONG (com chaves Pix
--   cifradas), configuração de gateways de pagamento (segredos cifrados),
--   páginas institucionais com histórico de versões e o modo de manutenção.
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - Tabelas: configuracoes_ong, configuracoes_gateway, paginas_institucionais,
--     paginas_institucionais_versoes, modo_manutencao.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende de usuarios (schema 000).
--   - Chave de cifragem: ENCRYPTION_KEY (.env.example), ainda reservada.
--   - Reversão: migrations/rollback/007-configuracoes-conteudo.sql.
-- ============================================================================

-- Migration aditiva: configuracoes da ONG, gateway e conteudo versionado.
-- Segredos devem ser cifrados pela aplicacao antes da persistencia.
-- Rollback correspondente: migrations/rollback/007-configuracoes-conteudo.sql.

-- Dados da ONG. "id = 1" com CHECK garante uma ÚNICA linha (tabela de configuração "singleton").
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

-- Configuração de cada gateway de pagamento (um por provedor), com a parte pública e os segredos cifrados.
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

-- Páginas institucionais (ex.: "quem somos"): slug é o endereço amigável (/quem-somos), único.
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

-- Histórico de versões de cada página (versão única por página).
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

-- Versões de uma página, da mais nova para a mais antiga.
CREATE INDEX idx_paginas_versoes_historico
  ON paginas_institucionais_versoes (pagina_id, versao DESC);

-- Modo de manutenção do site (também uma única linha).
CREATE TABLE modo_manutencao (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo boolean NOT NULL DEFAULT false,
  mensagem_publica varchar(500),
  iniciado_em timestamptz,
  atualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Cria duas tabelas de configuração de linha única (ONG e manutenção), a de
--   gateways (uma linha por provedor) e as páginas com versionamento.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Tabelas "singleton" com CHECK (id = 1).
--   - Segredos cifrados no banco (a chave fica fora dele).
--   - Versionamento de conteúdo e slugs.
--   - SEO (descrição para buscadores).
-- ============================================================================
