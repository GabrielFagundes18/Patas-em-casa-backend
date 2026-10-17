-- ============================================================================
-- ARQUIVO: 002-animais-prontuario.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration do PRONTUÁRIO DOS ANIMAIS: novas colunas no perfil (necessidades
--   especiais, história do resgate), histórico de mudanças de status, vacinas,
--   procedimentos veterinários, medicações e um catálogo de status adicionais.
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - ALTER TABLE animais (2 colunas).
--   - Tabelas: animais_status_historico, animais_vacinas, animais_procedimentos_veterinarios,
--     animais_medicacoes, status_animal_adicionais_catalogo.
--   - Índices para alertas (reforço de vacina, próximo procedimento, medicações ativas).
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende da tabela animais (schema 000).
--   - Reversão: migrations/rollback/002-animais-prontuario.sql.
-- ============================================================================

-- Migration aditiva: perfil de animais, midias e prontuario veterinario.
-- PRE-CONDICAO: confirmar a constraint real de animais.status antes de habilitar
-- em_tratamento e lar_temporario na aplicacao. Este draft nao remove constraints existentes.
-- Rollback correspondente: migrations/rollback/002-animais-prontuario.sql.

-- temperamento e animais_midias foram para a migration 012 (fotos-temperamento-animais).
-- Novas colunas de texto livre (ADD COLUMN IF NOT EXISTS: não dá erro se já existirem).
ALTER TABLE animais
  ADD COLUMN IF NOT EXISTS necessidades_especiais text,
  ADD COLUMN IF NOT EXISTS historia_resgate text;

-- Histórico de mudanças de status (de → para, motivo e quem mudou).
CREATE TABLE animais_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
  status_anterior varchar(30),
  status_novo varchar(30) NOT NULL,
  motivo text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Histórico de um animal, do mais recente para o mais antigo.
CREATE INDEX idx_animais_status_historico_animal_data
  ON animais_status_historico (animal_id, criado_em DESC);

-- Vacinas aplicadas. O CHECK no fim garante que o reforço não seja antes da aplicação.
CREATE TABLE animais_vacinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
  tipo varchar(100) NOT NULL,
  dose varchar(100),
  aplicada_em date NOT NULL,
  reforco_em date,
  observacoes text,
  registrado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (reforco_em IS NULL OR reforco_em >= aplicada_em)
);

-- Índice parcial para alertas de reforço.
CREATE INDEX idx_animais_vacinas_alertas
  ON animais_vacinas (reforco_em)
  WHERE reforco_em IS NOT NULL;

-- Procedimentos veterinários (tipo limitado a uma lista; datas coerentes).
CREATE TABLE animais_procedimentos_veterinarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
  tipo varchar(30) NOT NULL CHECK (tipo IN ('castracao', 'vermifugacao', 'exame', 'cirurgia', 'outro')),
  descricao varchar(300) NOT NULL,
  realizado_em date,
  proximo_em date,
  observacoes text,
  registrado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (proximo_em IS NULL OR realizado_em IS NULL OR proximo_em >= realizado_em)
);

-- Índice parcial para alertas do próximo procedimento.
CREATE INDEX idx_animais_procedimentos_alertas
  ON animais_procedimentos_veterinarios (proximo_em)
  WHERE proximo_em IS NOT NULL;

-- Medicações (com período e indicação de ativa).
CREATE TABLE animais_medicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
  medicamento varchar(200) NOT NULL,
  dosagem varchar(200),
  iniciado_em date NOT NULL,
  terminar_em date,
  instrucoes text,
  ativo boolean NOT NULL DEFAULT true,
  registrado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (terminar_em IS NULL OR terminar_em >= iniciado_em)
);

-- Índice parcial das medicações ativas.
CREATE INDEX idx_animais_medicacoes_ativas
  ON animais_medicacoes (animal_id, terminar_em)
  WHERE ativo = true;

-- Catálogo de status extras previstos (ainda não aceitos pela restrição de animais.status).
CREATE TABLE status_animal_adicionais_catalogo (
  status varchar(30) PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Insere os dois status; ON CONFLICT DO NOTHING permite rodar de novo sem erro (idempotente).
INSERT INTO status_animal_adicionais_catalogo (status)
VALUES ('em_tratamento'), ('lar_temporario')
ON CONFLICT (status) DO NOTHING;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Acrescenta colunas a animais e cria as tabelas do prontuário, cada uma ligada
--   ao animal (ON DELETE CASCADE) e com índices pensados para alertas.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Migrations "aditivas" (só acrescentam, não quebram o que existe).
--   - CHECK entre colunas (coerência de datas) e listas fixas de valores.
--   - Índices parciais para consultas de alerta.
--   - INSERT ... ON CONFLICT DO NOTHING (idempotência).
-- ============================================================================
