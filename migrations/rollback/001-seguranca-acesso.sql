-- Reversao destrutiva da migration 001.
-- Executar somente se a migration ainda nao tiver sido usada para armazenar dados.

DROP TRIGGER IF EXISTS trg_auditoria_eventos_imutaveis ON auditoria_eventos;
DROP FUNCTION IF EXISTS bloquear_mutacao_auditoria();
DROP TABLE IF EXISTS auditoria_eventos;
DROP TABLE IF EXISTS tokens_redefinicao_acesso;
DROP TABLE IF EXISTS tokens_renovacao;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS desafios_2fa;
DROP TABLE IF EXISTS codigos_recuperacao_2fa;
DROP TABLE IF EXISTS usuarios_totp;
DROP TABLE IF EXISTS tentativas_login;