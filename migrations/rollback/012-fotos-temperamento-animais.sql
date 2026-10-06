-- Reversão destrutiva da 012: apaga o registro da galeria e o temperamento.
-- Os arquivos em UPLOAD_DIR/animais não são apagados; foto_url de cada animal continua valendo.

DROP TABLE IF EXISTS animais_midias;
ALTER TABLE animais DROP COLUMN IF EXISTS temperamento;
