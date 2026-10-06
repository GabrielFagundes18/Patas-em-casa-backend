-- 012 — Galeria de fotos e temperamento dos animais.
-- Substitui "animais_midias" e a coluna "temperamento" propostas na 002. Os arquivos ficam no disco
-- do servidor (UPLOAD_DIR); o banco guarda só o nome do arquivo (objeto_chave).

ALTER TABLE animais ADD COLUMN temperamento text[] NOT NULL DEFAULT '{}';

CREATE TABLE animais_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
  objeto_chave varchar(200) NOT NULL UNIQUE,
  mime_type varchar(50) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  tamanho_bytes integer NOT NULL CHECK (tamanho_bytes > 0),
  ordem integer NOT NULL DEFAULT 0 CHECK (ordem >= 0),
  principal boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_animais_midias_animal ON animais_midias (animal_id, ordem);
-- No máximo uma foto principal por animal.
CREATE UNIQUE INDEX uq_animais_midias_principal ON animais_midias (animal_id) WHERE principal;
