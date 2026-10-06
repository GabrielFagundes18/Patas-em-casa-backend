-- Migration aditiva: perfil de animais, midias e prontuario veterinario.
-- PRE-CONDICAO: confirmar a constraint real de animais.status antes de habilitar
-- em_tratamento e lar_temporario na aplicacao. Este draft nao remove constraints existentes.
-- Rollback correspondente: migrations/rollback/002-animais-prontuario.sql.

-- temperamento e animais_midias foram para a migration 012 (fotos-temperamento-animais).
ALTER TABLE animais
  ADD COLUMN IF NOT EXISTS necessidades_especiais text,
  ADD COLUMN IF NOT EXISTS historia_resgate text;

CREATE TABLE animais_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
  status_anterior varchar(30),
  status_novo varchar(30) NOT NULL,
  motivo text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_animais_status_historico_animal_data
  ON animais_status_historico (animal_id, criado_em DESC);

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

CREATE INDEX idx_animais_vacinas_alertas
  ON animais_vacinas (reforco_em)
  WHERE reforco_em IS NOT NULL;

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

CREATE INDEX idx_animais_procedimentos_alertas
  ON animais_procedimentos_veterinarios (proximo_em)
  WHERE proximo_em IS NOT NULL;

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

CREATE INDEX idx_animais_medicacoes_ativas
  ON animais_medicacoes (animal_id, terminar_em)
  WHERE ativo = true;

CREATE TABLE status_animal_adicionais_catalogo (
  status varchar(30) PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO status_animal_adicionais_catalogo (status)
VALUES ('em_tratamento'), ('lar_temporario')
ON CONFLICT (status) DO NOTHING;