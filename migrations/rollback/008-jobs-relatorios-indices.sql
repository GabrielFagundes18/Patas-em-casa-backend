-- ============================================================================
-- ARQUIVO: rollback/008-jobs-relatorios-indices.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 008 (jobs, relatórios e índices): remove três índices
--   de desempenho e as tabelas de exportações, alertas e execuções de tarefas
--   agendadas (jobs).
--
-- PRINCIPAIS COMANDOS:
--   - DROP INDEX e DROP TABLE.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/008-jobs-relatorios-indices.sql.
-- ============================================================================

-- Reversao destrutiva da migration 008.

-- Índices que aceleravam buscas e relatórios.
DROP INDEX IF EXISTS idx_doacoes_email_busca;
DROP INDEX IF EXISTS idx_doacoes_status_data;
DROP INDEX IF EXISTS idx_pedidos_adocao_status_data;
-- Tabelas de exportações de relatórios, alertas e execuções de jobs.
DROP TABLE IF EXISTS relatorios_exportacoes;
DROP TABLE IF EXISTS alertas_sistema;
DROP TABLE IF EXISTS execucoes_jobs;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Remove índices (não perde dados, só desempenho) e as tabelas da 008.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Índices: o que são e o custo/benefício de mantê-los.
--   - Jobs (tarefas agendadas) e registro de execuções.
-- ============================================================================
