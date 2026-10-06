-- Reversão da 009. Falha de propósito se ainda houver usuários com o cargo gestor_ong:
-- troque o cargo deles antes de executar.

ALTER TABLE usuarios DROP CONSTRAINT usuarios_cargo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cargo_check
  CHECK (cargo IN ('administrador', 'gestor_animais', 'financeiro', 'voluntariado'));
