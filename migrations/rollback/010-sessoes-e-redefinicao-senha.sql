-- ============================================================================
-- ARQUIVO: rollback/010-sessoes-e-redefinicao-senha.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 010: remove as tabelas de sessões do painel e de
--   links de redefinição de senha/convite.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/010-sessoes-e-redefinicao-senha.sql (aplicada; não comentada).
--   - Tabelas usadas por src/modules/auth/session-repository.js e access-link-repository.js.
-- ============================================================================

-- Reversão da 010: encerra todas as sessões abertas e invalida links de redefinição pendentes.
-- Depois dela, a API precisa voltar à versão anterior (sem sessões no banco).

-- Links de redefinição/convite.
DROP TABLE IF EXISTS tokens_redefinicao_acesso;
-- Sessões do painel (todo mundo precisará entrar de novo).
DROP TABLE IF EXISTS sessoes;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove as duas tabelas; a API atual depende delas, então o código também
--   precisa voltar para a versão anterior.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Compatibilidade entre versões do código e do banco ao reverter migrations.
-- ============================================================================
