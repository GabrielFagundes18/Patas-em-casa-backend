-- ============================================================================
-- ARQUIVO: rollback/005-financeiro-apadrinhamento.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 005 (financeiro e apadrinhamento): remove as tabelas
--   de necessidades físicas (doações de itens), lançamentos financeiros,
--   cobranças e apadrinhamentos. Destrutivo.
--
-- PRINCIPAIS COMANDOS:
--   - DROP TABLE.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/005-financeiro-apadrinhamento.sql.
-- ============================================================================

-- Reversao destrutiva da migration 005.
-- Exportar conciliacoes, cobrancas e lancamentos antes de executar, se necessario.

-- Necessidades físicas (ex.: ração, remédios) e lançamentos financeiros.
DROP TABLE IF EXISTS necessidades_fisicas;
DROP TABLE IF EXISTS financeiro_lancamentos;
-- Cobranças antes dos apadrinhamentos (as cobranças apontam para eles).
DROP TABLE IF EXISTS apadrinhamentos_cobrancas;
DROP TABLE IF EXISTS apadrinhamentos;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove as quatro tabelas da 005, das dependentes para as principais.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Dependências entre tabelas e ordem de DROP.
-- ============================================================================
