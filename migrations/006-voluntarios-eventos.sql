-- Migration aditiva: dados operacionais de voluntarios e agenda de eventos.
-- Rollback correspondente: migrations/rollback/006-voluntarios-eventos.sql.

ALTER TABLE voluntarios
  ADD COLUMN IF NOT EXISTS disponibilidade jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS possui_veiculo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS habilidades jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_triagem varchar(20) NOT NULL DEFAULT 'pendente';

CREATE INDEX IF NOT EXISTS idx_voluntarios_triagem
  ON voluntarios (status_triagem, id);

CREATE TABLE eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo varchar(180) NOT NULL,
  descricao text,
  local varchar(300) NOT NULL,
  inicia_em timestamptz NOT NULL,
  termina_em timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'realizado', 'cancelado')),
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (termina_em > inicia_em)
);

CREATE INDEX idx_eventos_calendario
  ON eventos (inicia_em, termina_em)
  WHERE status <> 'cancelado';

CREATE TABLE eventos_animais (
  evento_id uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE RESTRICT,
  confirmado boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, animal_id)
);

CREATE INDEX idx_eventos_animais_animal
  ON eventos_animais (animal_id, evento_id);

CREATE TABLE eventos_voluntarios (
  evento_id uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  voluntario_id uuid NOT NULL REFERENCES voluntarios(id) ON DELETE RESTRICT,
  funcao varchar(120),
  status varchar(20) NOT NULL DEFAULT 'escalado'
    CHECK (status IN ('escalado', 'confirmado', 'cancelado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, voluntario_id)
);

CREATE INDEX idx_eventos_voluntarios_voluntario
  ON eventos_voluntarios (voluntario_id, evento_id);