-- ============================================================================
-- ARQUIVO: rollback/000-patas-em-casa-schema.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK (reversão) da migration 000, o schema base. Desfaz tudo o que a
--   000 criou: views, tabelas e a função de "atualizado_em". APAGA TODOS OS DADOS.
--   Não é executado automaticamente: só manualmente, num banco descartável.
--
-- PRINCIPAIS COMANDOS:
--   - DROP VIEW / DROP TABLE / DROP FUNCTION ... IF EXISTS.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/000-patas-em-casa-schema.sql.
--   - Não é lido por scripts/migrar.js (que só aplica as migrations de ordem.json).
-- ============================================================================

-- Rollback do schema base: APAGA TODAS as tabelas e dados do Patas em Casa.
-- Use somente em banco descartável (ex.: branch de testes). Nunca em produção.

-- Primeiro as views (elas dependem das tabelas). "IF EXISTS" evita erro se já não existirem.
DROP VIEW IF EXISTS vw_kpis_gerais;
DROP VIEW IF EXISTS vw_doacoes_por_mes;
-- Depois as tabelas, das "filhas" (que apontam para outras) para as "mães",
-- para não violar chaves estrangeiras.
DROP TABLE IF EXISTS voluntario_areas;
DROP TABLE IF EXISTS voluntarios;
DROP TABLE IF EXISTS historias;
DROP TABLE IF EXISTS doacoes;
DROP TABLE IF EXISTS pedidos_adocao;
DROP TABLE IF EXISTS adotantes;
DROP TABLE IF EXISTS animais;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS adoption_steps;
-- Por fim, a função usada pelos gatilhos (triggers) que atualizavam a coluna atualizado_em.
DROP FUNCTION IF EXISTS set_atualizado_em();

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove views → tabelas dependentes → tabelas principais → função, na ordem
--   inversa das dependências.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Migrations de reversão (rollback / "down").
--   - DROP ... IF EXISTS e ordem de remoção por dependência (chaves estrangeiras).
--   - Por que nunca rodar um rollback destrutivo em produção.
-- ============================================================================
