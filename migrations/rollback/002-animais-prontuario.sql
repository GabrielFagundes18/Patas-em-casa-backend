-- Reversao destrutiva da migration 002.
-- Executar somente apos exportar os dados veterinarios e de midia, se necessario.

DROP TABLE IF EXISTS status_animal_adicionais_catalogo;
DROP TABLE IF EXISTS animais_medicacoes;
DROP TABLE IF EXISTS animais_procedimentos_veterinarios;
DROP TABLE IF EXISTS animais_vacinas;
DROP TABLE IF EXISTS animais_status_historico;

ALTER TABLE animais
  DROP COLUMN IF EXISTS historia_resgate,
  DROP COLUMN IF EXISTS necessidades_especiais;