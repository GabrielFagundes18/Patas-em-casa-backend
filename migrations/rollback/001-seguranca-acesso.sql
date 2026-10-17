-- ============================================================================
-- ARQUIVO: rollback/001-seguranca-acesso.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 001 (segurança de acesso): remove a auditoria, as
--   tabelas de autenticação em dois fatores (2FA/TOTP) e o registro de
--   tentativas de login. Destrutivo: apaga esses dados.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TRIGGER, DROP FUNCTION, DROP TABLE.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/001-seguranca-acesso.sql.
-- ============================================================================

-- Reversao destrutiva da migration 001.
-- Executar somente se a migration ainda nao tiver sido usada para armazenar dados.

-- Gatilho e função que impediam alterar/apagar eventos de auditoria (auditoria "imutável").
DROP TRIGGER IF EXISTS trg_auditoria_eventos_imutaveis ON auditoria_eventos;
DROP FUNCTION IF EXISTS bloquear_mutacao_auditoria();
-- Tabela de auditoria.
DROP TABLE IF EXISTS auditoria_eventos;
-- Tabelas de 2FA (desafios, códigos de recuperação e segredos TOTP).
DROP TABLE IF EXISTS desafios_2fa;
DROP TABLE IF EXISTS codigos_recuperacao_2fa;
DROP TABLE IF EXISTS usuarios_totp;
-- Registro de tentativas de login.
DROP TABLE IF EXISTS tentativas_login;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove o gatilho e a função antes da tabela de auditoria, depois as tabelas
--   de 2FA e de tentativas de login.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Triggers (gatilhos) e funções no PostgreSQL.
--   - Autenticação em dois fatores (TOTP) e códigos de recuperação.
-- ============================================================================
