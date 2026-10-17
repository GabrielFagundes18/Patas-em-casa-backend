-- ============================================================================
-- ARQUIVO: 003-adotantes-lgpd.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration de PROTEÇÃO DE DADOS DOS ADOTANTES (LGPD): CPF guardado CIFRADO
--   (com hash separado para busca), data de nascimento, endereço estruturado,
--   respostas detalhadas do formulário de adoção, consentimentos e solicitações
--   do titular (exportar, anonimizar, excluir).
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - ALTER TABLE adotantes (colunas do CPF cifrado e outras) + restrição de consistência.
--   - Índices: único do hash do CPF, busca por nome e por telefone.
--   - Tabelas: pedidos_adocao_respostas, consentimentos_lgpd, solicitacoes_lgpd.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende de adotantes e pedidos_adocao (schema 000).
--   - Chave de cifragem: variável ENCRYPTION_KEY (.env.example), ainda reservada.
--   - Reversão: migrations/rollback/003-adotantes-lgpd.sql.
-- ============================================================================

-- Migration aditiva: protecao de CPF, consentimentos e solicitacoes LGPD.
-- A chave de cifragem deve permanecer fora do banco, em secret manager da aplicacao.
-- Rollback correspondente: migrations/rollback/003-adotantes-lgpd.sql.

-- Novas colunas de adotantes. O CPF cifrado é guardado em partes (cifra autenticada:
-- texto cifrado + nonce + tag), com a versão da chave e um hash para busca sem decifrar.
-- dados_endereco: jsonb com padrão '{}' (objeto vazio).
ALTER TABLE adotantes
  ADD COLUMN IF NOT EXISTS cpf_cifrado bytea,
  ADD COLUMN IF NOT EXISTS cpf_nonce bytea,
  ADD COLUMN IF NOT EXISTS cpf_tag_autenticacao bytea,
  ADD COLUMN IF NOT EXISTS cpf_hash_busca bytea,
  ADD COLUMN IF NOT EXISTS cpf_versao_chave smallint,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS dados_endereco jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS anonimizado_em timestamptz;

-- Consistência: ou TODAS as partes do CPF estão vazias, ou TODAS estão preenchidas (e a versão > 0).
ALTER TABLE adotantes
  ADD CONSTRAINT ck_adotantes_cpf_cifrado_completo
  CHECK (
    (cpf_cifrado IS NULL AND cpf_nonce IS NULL AND cpf_tag_autenticacao IS NULL
      AND cpf_hash_busca IS NULL AND cpf_versao_chave IS NULL)
    OR
    (cpf_cifrado IS NOT NULL AND cpf_nonce IS NOT NULL AND cpf_tag_autenticacao IS NOT NULL
      AND cpf_hash_busca IS NOT NULL AND cpf_versao_chave IS NOT NULL AND cpf_versao_chave > 0)
  );

-- Um CPF por adotante (índice único parcial no hash).
CREATE UNIQUE INDEX IF NOT EXISTS uq_adotantes_cpf_hash_busca
  ON adotantes (cpf_hash_busca)
  WHERE cpf_hash_busca IS NOT NULL;

-- Índice de expressão: busca de nome sem diferenciar maiúsculas (LOWER(nome)).
CREATE INDEX IF NOT EXISTS idx_adotantes_nome_busca
  ON adotantes (LOWER(nome));

-- Busca por telefone (só linhas com telefone).
CREATE INDEX IF NOT EXISTS idx_adotantes_telefone_busca
  ON adotantes (telefone)
  WHERE telefone IS NOT NULL;

-- Respostas detalhadas do formulário (uma linha por pedido; jsonb para estrutura flexível).
CREATE TABLE pedidos_adocao_respostas (
  pedido_id uuid PRIMARY KEY REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  residencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotina jsonb NOT NULL DEFAULT '{}'::jsonb,
  outros_animais jsonb NOT NULL DEFAULT '[]'::jsonb,
  consentimento_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Consentimentos LGPD (finalidade, versão do termo, quando foi dado/revogado e de onde).
-- ON DELETE RESTRICT: impede apagar um adotante que tenha consentimentos registrados.
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

-- Liga as respostas ao consentimento (criada depois porque a tabela de consentimentos ainda não existia).
-- ON DELETE SET NULL: se o consentimento sumir, o campo fica vazio.
ALTER TABLE pedidos_adocao_respostas
  ADD CONSTRAINT fk_pedidos_adocao_respostas_consentimento
  FOREIGN KEY (consentimento_id) REFERENCES consentimentos_lgpd(id) ON DELETE SET NULL;

-- Consentimentos de um adotante, mais recentes primeiro.
CREATE INDEX idx_consentimentos_lgpd_adotante_data
  ON consentimentos_lgpd (adotante_id, concedido_em DESC);

-- Solicitações do titular (exportar/anonimizar/excluir), com status, protocolo, prazo e arquivo gerado.
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

-- Fila de solicitações por status e prazo.
CREATE INDEX idx_solicitacoes_lgpd_status_prazo
  ON solicitacoes_lgpd (status, prazo_em);

-- Solicitações de um adotante, mais recentes primeiro.
CREATE INDEX idx_solicitacoes_lgpd_adotante_data
  ON solicitacoes_lgpd (adotante_id, solicitada_em DESC);

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Acrescenta as colunas do CPF cifrado e a regra de consistência, cria os
--   índices de busca e as tabelas de respostas, consentimentos e solicitações,
--   ligando respostas a consentimentos por uma chave estrangeira criada depois.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Cifrar dados pessoais e buscar por hash (sem decifrar).
--   - CHECK com OR/AND entre várias colunas.
--   - jsonb, índices de expressão (LOWER) e índices únicos parciais.
--   - ON DELETE CASCADE x RESTRICT x SET NULL.
--   - LGPD: consentimento, revogação e direitos do titular.
-- ============================================================================
