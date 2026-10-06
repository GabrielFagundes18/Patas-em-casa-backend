-- 011 — Agenda de visitas e entrevistas dos pedidos de adoção.
-- Substitui "pedidos_adocao_agendamentos" proposta na 004. O conflito de horários é verificado
-- pela API (mesmo responsável, intervalos sobrepostos) dentro de uma transação com trava.

ALTER TABLE pedidos_adocao ADD COLUMN visita_preferida_em timestamptz;

CREATE TABLE pedidos_adocao_agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES pedidos_adocao(id) ON DELETE CASCADE,
  tipo varchar(20) NOT NULL CHECK (tipo IN ('visita', 'entrevista')),
  status varchar(20) NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'realizado', 'cancelado')),
  previsto_em timestamptz NOT NULL,
  duracao_minutos smallint NOT NULL DEFAULT 60 CHECK (duracao_minutos BETWEEN 15 AND 480),
  local varchar(300),
  mensagem text,
  responsavel_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agendamentos_pedido ON pedidos_adocao_agendamentos (pedido_id);
CREATE INDEX idx_agendamentos_ativos ON pedidos_adocao_agendamentos (previsto_em) WHERE status = 'agendado';

CREATE TRIGGER trg_agendamentos_atualizado
  BEFORE UPDATE ON pedidos_adocao_agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
