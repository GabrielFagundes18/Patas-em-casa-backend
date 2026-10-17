-- ============================================================================
-- ARQUIVO: 006-voluntarios-eventos.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration de VOLUNTÁRIOS e EVENTOS: dados operacionais do voluntário
--   (disponibilidade, veículo, habilidades, status da triagem) e uma agenda de
--   eventos (ex.: feiras de adoção) com os animais e voluntários de cada um.
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - ALTER TABLE voluntarios (4 colunas) + índice de triagem.
--   - Tabelas: eventos, eventos_animais, eventos_voluntarios.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende de voluntarios, animais e usuarios (schema 000).
--   - Reversão: migrations/rollback/006-voluntarios-eventos.sql.
-- ============================================================================

-- Migration aditiva: dados operacionais de voluntarios e agenda de eventos.
-- Rollback correspondente: migrations/rollback/006-voluntarios-eventos.sql.

-- Novas colunas do voluntário ('{}' = objeto JSON vazio; '[]' = lista JSON vazia).
ALTER TABLE voluntarios
  ADD COLUMN IF NOT EXISTS disponibilidade jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS possui_veiculo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS habilidades jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_triagem varchar(20) NOT NULL DEFAULT 'pendente';

-- Fila de triagem dos voluntários.
CREATE INDEX IF NOT EXISTS idx_voluntarios_triagem
  ON voluntarios (status_triagem, id);

-- Eventos (o fim precisa ser depois do início).
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

-- Calendário (ignora eventos cancelados).
CREATE INDEX idx_eventos_calendario
  ON eventos (inicia_em, termina_em)
  WHERE status <> 'cancelado';

-- Animais levados a cada evento. A chave primária é o PAR (evento, animal): não repete o mesmo animal no evento.
CREATE TABLE eventos_animais (
  evento_id uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE RESTRICT,
  confirmado boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, animal_id)
);

-- Eventos de um animal (busca no sentido contrário da chave primária).
CREATE INDEX idx_eventos_animais_animal
  ON eventos_animais (animal_id, evento_id);

-- Escala de voluntários por evento (função e status da escalação).
CREATE TABLE eventos_voluntarios (
  evento_id uuid NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  voluntario_id uuid NOT NULL REFERENCES voluntarios(id) ON DELETE RESTRICT,
  funcao varchar(120),
  status varchar(20) NOT NULL DEFAULT 'escalado'
    CHECK (status IN ('escalado', 'confirmado', 'cancelado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, voluntario_id)
);

-- Eventos de um voluntário.
CREATE INDEX idx_eventos_voluntarios_voluntario
  ON eventos_voluntarios (voluntario_id, evento_id);

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Amplia voluntarios e cria eventos com duas tabelas de ligação (animais e
--   voluntários), cada uma com chave primária composta e índice "ao contrário".
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Chave primária composta (PRIMARY KEY (a, b)).
--   - Tabelas de ligação muitos-para-muitos com dados extras (função, status).
--   - jsonb para dados flexíveis (disponibilidade, habilidades).
-- ============================================================================
