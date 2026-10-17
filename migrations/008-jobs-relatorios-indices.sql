-- ============================================================================
-- ARQUIVO: 008-jobs-relatorios-indices.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration de TAREFAS EM SEGUNDO PLANO e DESEMPENHO: registro de execuções
--   de jobs (tarefas agendadas) sem repetição, alertas do sistema, fila de
--   relatórios exportados de forma assíncrona e índices para as consultas mais
--   comuns de pedidos e doações.
--   É uma PROPOSTA (não está em migrations/ordem.json).
--
-- PRINCIPAIS ITENS:
--   - Tabelas: execucoes_jobs, alertas_sistema, relatorios_exportacoes.
--   - Índices em pedidos_adocao e doacoes.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende de usuarios, pedidos_adocao e doacoes (schema 000).
--   - Reversão: migrations/rollback/008-jobs-relatorios-indices.sql.
-- ============================================================================

-- Migration aditiva: execucao idempotente de jobs, alertas e exports assincronos.
-- Rollback correspondente: migrations/rollback/008-jobs-relatorios-indices.sql.

-- Execuções de jobs. UNIQUE (job, chave_idempotencia) impede rodar a mesma tarefa duas vezes
-- para a mesma chave (ex.: "lembrete de vacina de 2026-10-16").
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

-- Execuções que falharam, mais recentes primeiro.
CREATE INDEX idx_execucoes_jobs_falhas
  ON execucoes_jobs (iniciada_em DESC)
  WHERE status = 'falhou';

-- Alertas para a equipe (ex.: reforço de vacina chegando), sem duplicar (chave de idempotência única).
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

-- Alertas ainda não resolvidos.
CREATE INDEX idx_alertas_abertos_data
  ON alertas_sistema (previsto_em, criado_em)
  WHERE resolvido_em IS NULL;

-- Fila de relatórios exportados (CSV/PDF) gerados em segundo plano, com validade do arquivo.
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

-- Relatórios de um usuário, mais recentes primeiro.
CREATE INDEX idx_relatorios_exportacoes_usuario_data
  ON relatorios_exportacoes (usuario_id, criado_em DESC);

-- Itens esperando na fila, por ordem de chegada.
CREATE INDEX idx_relatorios_exportacoes_fila
  ON relatorios_exportacoes (criado_em)
  WHERE status = 'fila';

-- Índices de desempenho em tabelas existentes (IF NOT EXISTS: seguros de rodar de novo).
-- Pedidos por status e data (listas e quadro da triagem).
CREATE INDEX IF NOT EXISTS idx_pedidos_adocao_status_data
  ON pedidos_adocao (status, data_pedido DESC);

-- Doações por status e data (resumo e séries).
CREATE INDEX IF NOT EXISTS idx_doacoes_status_data
  ON doacoes (status, data DESC);

-- Busca de doações por e-mail sem diferenciar maiúsculas.
CREATE INDEX IF NOT EXISTS idx_doacoes_email_busca
  ON doacoes (LOWER(doador_email))
  WHERE doador_email IS NOT NULL;

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Cria as tabelas de jobs, alertas e exportações (com unicidade para não
--   repetir trabalho) e acrescenta índices às tabelas mais consultadas.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Idempotência de tarefas agendadas com chaves únicas.
--   - Filas de trabalho no banco (status + índice parcial).
--   - Índices compostos, de expressão (LOWER) e parciais para desempenho.
-- ============================================================================
