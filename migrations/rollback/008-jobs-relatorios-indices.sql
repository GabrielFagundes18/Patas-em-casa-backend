-- Reversao destrutiva da migration 008.

DROP INDEX IF EXISTS idx_doacoes_email_busca;
DROP INDEX IF EXISTS idx_doacoes_status_data;
DROP INDEX IF EXISTS idx_pedidos_adocao_status_data;
DROP TABLE IF EXISTS relatorios_exportacoes;
DROP TABLE IF EXISTS alertas_sistema;
DROP TABLE IF EXISTS execucoes_jobs;