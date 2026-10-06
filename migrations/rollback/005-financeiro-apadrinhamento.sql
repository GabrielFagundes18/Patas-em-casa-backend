-- Reversao destrutiva da migration 005.
-- Exportar conciliacoes, cobrancas e lancamentos antes de executar, se necessario.

DROP TABLE IF EXISTS necessidades_fisicas;
DROP TABLE IF EXISTS financeiro_lancamentos;
DROP TABLE IF EXISTS apadrinhamentos_cobrancas;
DROP TABLE IF EXISTS apadrinhamentos;