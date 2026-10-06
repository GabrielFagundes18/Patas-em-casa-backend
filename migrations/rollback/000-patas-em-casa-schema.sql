-- Rollback do schema base: APAGA TODAS as tabelas e dados do Patas em Casa.
-- Use somente em banco descartável (ex.: branch de testes). Nunca em produção.

DROP VIEW IF EXISTS vw_kpis_gerais;
DROP VIEW IF EXISTS vw_doacoes_por_mes;
DROP TABLE IF EXISTS voluntario_areas;
DROP TABLE IF EXISTS voluntarios;
DROP TABLE IF EXISTS historias;
DROP TABLE IF EXISTS doacoes;
DROP TABLE IF EXISTS pedidos_adocao;
DROP TABLE IF EXISTS adotantes;
DROP TABLE IF EXISTS animais;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS adoption_steps;
DROP FUNCTION IF EXISTS set_atualizado_em();
