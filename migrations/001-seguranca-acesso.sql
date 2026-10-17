-- ============================================================================
-- ARQUIVO: 001-seguranca-acesso.sql (PROPOSTA — ainda não aplicada)
-- ============================================================================
--
-- PARA QUE SERVE:
--   Migration que cria estruturas de SEGURANÇA DE ACESSO: registro de
--   tentativas de login (por conta + IP), autenticação em dois fatores (TOTP,
--   códigos de recuperação e desafios) e a tabela de AUDITORIA, protegida por
--   um gatilho que impede alterar ou apagar eventos.
--   É uma PROPOSTA: não está em migrations/ordem.json, então scripts/migrar.js
--   ainda não a aplica. (A API já usa auditoria_eventos se a tabela existir —
--   veja src/modules/audit/audit-repository.js.)
--
-- PRINCIPAIS ITENS:
--   - Tabelas: tentativas_login, usuarios_totp, codigos_recuperacao_2fa, desafios_2fa, auditoria_eventos.
--   - Índices (vários "parciais", com WHERE).
--   - Função bloquear_mutacao_auditoria() e gatilho trg_auditoria_eventos_imutaveis.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Depende do schema base (000: tabela usuarios e extensão pgcrypto, que fornece gen_random_uuid()).
--   - Reversão: migrations/rollback/001-seguranca-acesso.sql.
-- ============================================================================

-- Migration aditiva: estruturas de autenticacao e sessao.
-- Requer pgcrypto, ja previsto no schema-base.
-- Rollback correspondente: migrations/rollback/001-seguranca-acesso.sql.

-- Tentativas de login por conta (hash do e-mail) e IP, com bloqueio temporário.
-- - uuid PRIMARY KEY DEFAULT gen_random_uuid(): id gerado automaticamente pelo banco.
-- - bytea: dados binários (aqui, um hash); inet: endereço IP.
-- - CHECK (falhas >= 0): regra validada pelo próprio banco.
-- - UNIQUE (chave_conta_hash, ip): uma linha por par conta+IP.
CREATE TABLE tentativas_login (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_conta_hash bytea NOT NULL,
  ip inet NOT NULL,
  falhas integer NOT NULL DEFAULT 1 CHECK (falhas >= 0),
  bloqueado_ate timestamptz,
  primeira_tentativa_em timestamptz NOT NULL DEFAULT now(),
  ultima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tentativas_login_conta_ip UNIQUE (chave_conta_hash, ip)
);

-- Índice PARCIAL: só indexa as linhas bloqueadas (WHERE ...), ficando menor e mais rápido.
CREATE INDEX idx_tentativas_login_bloqueado_ate
  ON tentativas_login (bloqueado_ate)
  WHERE bloqueado_ate IS NOT NULL;

-- Segredo TOTP (do aplicativo autenticador) de cada usuário, guardado CIFRADO
-- (texto cifrado + nonce + tag de autenticação + versão da chave usada).
-- REFERENCES usuarios(id) ON DELETE CASCADE: se o usuário for apagado, a linha também é.
CREATE TABLE usuarios_totp (
  usuario_id uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  segredo_cifrado bytea NOT NULL,
  nonce bytea NOT NULL,
  tag_autenticacao bytea NOT NULL,
  versao_chave smallint NOT NULL DEFAULT 1 CHECK (versao_chave > 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  confirmado_em timestamptz
);

-- Códigos de recuperação do 2FA (guardados só como hash; cada um só pode ser usado uma vez).
CREATE TABLE codigos_recuperacao_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash bytea NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz,
  CONSTRAINT uq_codigos_recuperacao_2fa_hash UNIQUE (usuario_id, codigo_hash)
);

-- Índice parcial dos códigos ainda não usados.
CREATE INDEX idx_codigos_recuperacao_2fa_disponiveis
  ON codigos_recuperacao_2fa (usuario_id)
  WHERE usado_em IS NULL;

-- Desafio do 2FA: etapa intermediária do login (senha certa, falta o código), com limite de tentativas e validade.
CREATE TABLE desafios_2fa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  tentativas smallint NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  usado_em timestamptz
);

-- Índice parcial para limpar/consultar desafios pendentes pela validade.
CREATE INDEX idx_desafios_2fa_expiracao
  ON desafios_2fa (expira_em)
  WHERE usado_em IS NULL;

-- sessoes, tokens_renovacao e tokens_redefinicao_acesso foram para a migration 010
-- (sessoes-e-redefinicao-senha), já usada pela API.

-- Auditoria: quem fez o quê, quando, de onde e o antes/depois (jsonb = JSON binário, consultável).
CREATE TABLE auditoria_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  cargo varchar(50),
  acao varchar(80) NOT NULL,
  modulo varchar(80) NOT NULL,
  entidade varchar(100),
  entidade_id uuid,
  ip inet,
  agente_usuario text,
  valores_antes jsonb,
  valores_depois jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultar a auditoria por data, por usuário e por entidade (mais recentes primeiro: DESC).
CREATE INDEX idx_auditoria_eventos_data
  ON auditoria_eventos (criado_em DESC);

CREATE INDEX idx_auditoria_eventos_usuario_data
  ON auditoria_eventos (usuario_id, criado_em DESC);

CREATE INDEX idx_auditoria_eventos_entidade
  ON auditoria_eventos (entidade, entidade_id, criado_em DESC);

-- Função em PL/pgSQL (linguagem de programação do PostgreSQL) que sempre lança um erro.
-- O corpo fica entre $$ ... $$ ("dollar quoting"). RETURNS trigger = função para ser usada por gatilhos.
CREATE OR REPLACE FUNCTION bloquear_mutacao_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Eventos de auditoria são imutáveis.';
END;
$$;

-- Gatilho: ANTES de qualquer UPDATE ou DELETE em auditoria_eventos, para cada linha, chama a função
-- acima — ou seja, nenhum evento pode ser alterado ou apagado.
CREATE TRIGGER trg_auditoria_eventos_imutaveis
  BEFORE UPDATE OR DELETE ON auditoria_eventos
  FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao_auditoria();

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Cria as tabelas de tentativas de login e 2FA com seus índices, depois a
--   tabela de auditoria e, por fim, a função + gatilho que a tornam somente-inserção.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - CREATE TABLE: tipos (uuid, bytea, inet, jsonb, timestamptz), DEFAULT, CHECK, UNIQUE.
--   - Chaves estrangeiras com ON DELETE CASCADE.
--   - Índices parciais (WHERE) e ordenados (DESC).
--   - Funções PL/pgSQL, gatilhos (BEFORE UPDATE OR DELETE) e auditoria imutável.
--   - 2FA/TOTP e armazenamento de segredos cifrados.
-- ============================================================================
