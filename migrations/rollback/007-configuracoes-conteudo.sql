-- ============================================================================
-- ARQUIVO: rollback/007-configuracoes-conteudo.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 007 (configurações e conteúdo): remove as páginas
--   institucionais (e suas versões), o modo de manutenção e as configurações
--   da ONG e do gateway de pagamento. Destrutivo.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/007-configuracoes-conteudo.sql.
-- ============================================================================

-- Reversao destrutiva da migration 007.
-- Exportar configuracoes, segredos cifrados e historico editorial antes de executar.

-- Versões antes das páginas (as versões apontam para as páginas).
DROP TABLE IF EXISTS paginas_institucionais_versoes;
DROP TABLE IF EXISTS paginas_institucionais;
-- Modo de manutenção e configurações.
DROP TABLE IF EXISTS modo_manutencao;
DROP TABLE IF EXISTS configuracoes_gateway;
DROP TABLE IF EXISTS configuracoes_ong;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove as cinco tabelas da 007, das dependentes para as independentes.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Versionamento de conteúdo (tabela de versões) e configurações no banco.
-- ============================================================================
