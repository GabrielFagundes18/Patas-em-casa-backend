-- Reversao destrutiva da migration 007.
-- Exportar configuracoes, segredos cifrados e historico editorial antes de executar.

DROP TABLE IF EXISTS paginas_institucionais_versoes;
DROP TABLE IF EXISTS paginas_institucionais;
DROP TABLE IF EXISTS modo_manutencao;
DROP TABLE IF EXISTS configuracoes_gateway;
DROP TABLE IF EXISTS configuracoes_ong;