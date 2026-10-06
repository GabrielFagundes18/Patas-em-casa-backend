-- Reversao destrutiva da migration 006.

DROP TABLE IF EXISTS eventos_voluntarios;
DROP TABLE IF EXISTS eventos_animais;
DROP TABLE IF EXISTS eventos;

DROP INDEX IF EXISTS idx_voluntarios_triagem;

ALTER TABLE voluntarios
  DROP COLUMN IF EXISTS status_triagem,
  DROP COLUMN IF EXISTS habilidades,
  DROP COLUMN IF EXISTS possui_veiculo,
  DROP COLUMN IF EXISTS disponibilidade;