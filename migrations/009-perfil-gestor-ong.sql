-- 009 — Cargo "gestor_ong" (Gestor da ONG).
-- Gerencia a operação da ONG (animais, adoções, adotantes, doações, voluntários e histórias),
-- sem acesso a equipe e acessos, que continuam com o administrador.
-- Recria a restrição de cargos mantendo todos os valores atuais.

ALTER TABLE usuarios DROP CONSTRAINT usuarios_cargo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cargo_check
  CHECK (cargo IN ('administrador', 'gestor_ong', 'gestor_animais', 'financeiro', 'voluntariado'));
