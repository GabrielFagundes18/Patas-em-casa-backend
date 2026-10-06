-- Reversão destrutiva da 011: apaga a agenda estruturada (o histórico de cada pedido mantém
-- as anotações de agendamento) e a data preferida informada pelos adotantes.

DROP TABLE IF EXISTS pedidos_adocao_agendamentos;
ALTER TABLE pedidos_adocao DROP COLUMN IF EXISTS visita_preferida_em;
