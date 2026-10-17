-- ============================================================================
-- ARQUIVO: 004-adocoes-lares-temporarios.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration que amplia as ADOÇÕES e cria os LARES TEMPORÁRIOS: protocolo e
--   justificativa da decisão no pedido, documentos (termo gerado/assinado),
--   acompanhamento pós-adoção (contatos e mídias) e lares temporários com o
--   histórico de quais animais estiveram em cada um.
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - ALTER TABLE pedidos_adocao (protocolo, justificativa_decisao) + índice único do protocolo.
--   - Tabelas: pedidos_adocao_documentos, pos_adocao_contatos, pos_adocao_midias,
--     lares_temporarios, animais_lares_temporarios.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende de pedidos_adocao, usuarios, voluntarios e animais (schema 000).
--   - Reversão: migrations/rollback/004-adocoes-lares-temporarios.sql.
-- ============================================================================

-- Migration aditiva: agenda, justificativas, documentos, pos-adocao e lares temporarios.
-- Rollback correspondente: migrations/rollback/004-adocoes-lares-temporarios.sql.

-- Protocolo e justificativa da decisão no próprio pedido.
ALTER TABLE pedidos_adocao
  ADD COLUMN IF NOT EXISTS protocolo varchar(40),
  ADD COLUMN IF NOT EXISTS justificativa_decisao text;

-- Protocolo único (só entre os pedidos que têm protocolo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_adocao_protocolo
  ON pedidos_adocao (protocolo)
  WHERE protocolo IS NOT NULL;

-- pedidos_adocao_agendamentos foi para a migration 011 (agenda-adocao).

-- Documentos do pedido (arquivos guardados num storage; aqui só a "chave" do objeto, tipo e tamanho).
-- ON DELETE SET NULL em criado_por: apagar o usuário não apaga o documento.
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

-- Documentos de um pedido, mais recentes primeiro.
CREATE INDEX idx_pedidos_documentos_pedido_data
  ON pedidos_adocao_documentos (pedido_id, criado_em DESC);

-- Contatos de acompanhamento pós-adoção (previsto, realizado, retorno e responsável).
CREATE TABLE pos_adocao_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  previsto_em timestamptz NOT NULL,
  realizado_em timestamptz,
  retorno text,
  responsavel_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Contatos pendentes (ainda não realizados), pela data prevista.
CREATE INDEX idx_pos_adocao_contatos_pendentes
  ON pos_adocao_contatos (previsto_em)
  WHERE realizado_em IS NULL;

-- Fotos/vídeos enviados no pós-adoção.
CREATE TABLE pos_adocao_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  objeto_chave varchar(500) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Lares temporários (cada um ligado a um voluntário; RESTRICT impede apagar o voluntário).
CREATE TABLE lares_temporarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voluntario_id uuid NOT NULL REFERENCES voluntarios(id) ON DELETE RESTRICT,
  capacidade smallint NOT NULL CHECK (capacidade > 0),
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Estadias de animais em lares temporários (início, fim, motivo).
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

-- Um animal só pode estar em UM lar temporário ativo por vez (único entre as estadias não encerradas).
CREATE UNIQUE INDEX uq_animais_lar_temporario_ativo
  ON animais_lares_temporarios (animal_id)
  WHERE encerrado_em IS NULL;

-- Histórico de estadias de um animal.
CREATE INDEX idx_animais_lares_temporarios_historico
  ON animais_lares_temporarios (animal_id, iniciado_em DESC);

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Amplia pedidos_adocao, cria documentos e pós-adoção ligados ao pedido, e
--   lares temporários com a tabela de estadias (regra: um lar ativo por animal).
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Guardar só a referência (chave) de arquivos no banco.
--   - Índice único parcial como regra de negócio ("só um ativo").
--   - Relação muitos-para-muitos com histórico (início/fim).
-- ============================================================================
