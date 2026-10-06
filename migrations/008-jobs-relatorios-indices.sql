-- Migration aditiva: execucao idempotente de jobs, alertas e exports assincronos.
-- Rollback correspondente: migrations/rollback/008-jobs-relatorios-indices.sql.

CREATE TABLE execucoes_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job varchar(120) NOT NULL,
  chave_idempotencia varchar(200) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'iniciado'
    CHECK (status IN ('iniciado', 'concluido', 'falhou')),
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz,
  codigo_erro varchar(80),
  CONSTRAINT uq_execucao_job_idempotencia UNIQUE (job, chave_idempotencia)
);

CREATE INDEX idx_execucoes_jobs_falhas
  ON execucoes_jobs (iniciada_em DESC)
  WHERE status = 'falhou';

CREATE TABLE alertas_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_idempotencia varchar(240) NOT NULL UNIQUE,
  tipo varchar(50) NOT NULL,
  entidade varchar(80) NOT NULL,
  entidade_id uuid NOT NULL,
  previsto_em timestamptz,
  payload_publico jsonb NOT NULL DEFAULT '{}'::jsonb,
  lido_em timestamptz,
  resolvido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alertas_abertos_data
  ON alertas_sistema (previsto_em, criado_em)
  WHERE resolvido_em IS NULL;

CREATE TABLE relatorios_exportacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo varchar(80) NOT NULL,
  formato varchar(10) NOT NULL CHECK (formato IN ('csv', 'pdf')),
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'fila'
    CHECK (status IN ('fila', 'processando', 'concluido', 'falhou', 'expirado')),
  objeto_chave varchar(500),
  expira_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);

CREATE INDEX idx_relatorios_exportacoes_usuario_data
  ON relatorios_exportacoes (usuario_id, criado_em DESC);

CREATE INDEX idx_relatorios_exportacoes_fila
  ON relatorios_exportacoes (criado_em)
  WHERE status = 'fila';

CREATE INDEX IF NOT EXISTS idx_pedidos_adocao_status_data
  ON pedidos_adocao (status, data_pedido DESC);

CREATE INDEX IF NOT EXISTS idx_doacoes_status_data
  ON doacoes (status, data DESC);

CREATE INDEX IF NOT EXISTS idx_doacoes_email_busca
  ON doacoes (LOWER(doador_email))
  WHERE doador_email IS NOT NULL;