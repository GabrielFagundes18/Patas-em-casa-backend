-- ============================================================================
-- ARQUIVO: 005-financeiro-apadrinhamento.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration do FINANCEIRO: APADRINHAMENTO de animais (contribuição mensal
--   para um animal específico) e suas cobranças, LANÇAMENTOS financeiros
--   (entradas e saídas, para prestação de contas pública) e NECESSIDADES
--   FÍSICAS (itens que a ONG precisa receber, como ração).
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - Tabelas: apadrinhamentos, apadrinhamentos_cobrancas, financeiro_lancamentos, necessidades_fisicas.
--   - Índices (vários parciais) para cobranças vencidas e itens publicados.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende de adotantes, animais, doacoes e usuarios (schema 000).
--   - Reversão: migrations/rollback/005-financeiro-apadrinhamento.sql.
-- ============================================================================

-- Migration aditiva: apadrinhamento, prestacao de contas, necessidades e webhooks.
-- Payloads de webhook devem ser cifrados pela aplicacao antes de serem gravados.
-- Rollback correspondente: migrations/rollback/005-financeiro-apadrinhamento.sql.

-- Apadrinhamentos: quem apadrinha qual animal, por quanto (numeric(10,2) = até 10 dígitos, 2 decimais) e o status.
-- DEFAULT CURRENT_DATE = data de hoje.
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

-- Apadrinhamentos de um animal por status.
CREATE INDEX idx_apadrinhamentos_animal_status
  ON apadrinhamentos (animal_id, status);

-- Apadrinhamentos de um adotante (só quando há adotante vinculado).
CREATE INDEX idx_apadrinhamentos_adotante
  ON apadrinhamentos (adotante_id)
  WHERE adotante_id IS NOT NULL;

-- Cobranças mensais (uma por mês de referência; ligada à doação quando paga).
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

-- Cobranças em aberto pela data de vencimento (para avisos de atraso).
CREATE INDEX idx_apadrinhamentos_cobrancas_vencidas
  ON apadrinhamentos_cobrancas (vence_em)
  WHERE status IN ('pendente', 'atrasada');

-- Lançamentos financeiros (entrada/saída), com comprovante e opção de publicar (transparência).
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

-- Lançamentos públicos, mais recentes primeiro.
CREATE INDEX idx_financeiro_lancamentos_publicos_data
  ON financeiro_lancamentos (ocorrido_em DESC)
  WHERE publicado = true;

-- Relatórios por categoria e data.
CREATE INDEX idx_financeiro_lancamentos_categoria_data
  ON financeiro_lancamentos (categoria, ocorrido_em DESC);

-- Necessidades físicas (o que falta, quanto já chegou, prioridade e status).
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

-- Necessidades publicadas no site, por status e prioridade.
CREATE INDEX idx_necessidades_publicas_status
  ON necessidades_fisicas (status, prioridade)
  WHERE publicado = true;

-- gateway_webhook_eventos foi para a migration 013 (doacoes-mercado-pago).

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Cria apadrinhamentos e cobranças mensais (uma por mês), lançamentos para
--   prestação de contas e necessidades físicas, com índices para as consultas
--   do painel e do site.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - numeric(precisão, escala) para dinheiro (nunca float).
--   - UNIQUE composto para impedir cobranças duplicadas no mesmo mês.
--   - Índices parciais com IN (...) e com flags booleanas.
--   - Transparência: dados "publicados" x internos.
-- ============================================================================
