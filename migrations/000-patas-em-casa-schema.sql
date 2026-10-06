-- Schema base do Patas em Casa: estado atual do banco no Neon (JÁ APLICADO em produção/desenvolvimento).
-- Use somente para criar um banco novo (ex.: branch de testes no Neon), antes das migrações 001 em diante.
-- Não execute em um banco que já possui estas tabelas.
-- Rollback correspondente: migrations/rollback/000-patas-em-casa-schema.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE adoption_steps (
  id serial PRIMARY KEY,
  step_order integer NOT NULL CONSTRAINT adoption_steps_step_order_key UNIQUE,
  title varchar(100) NOT NULL,
  description text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(150) NOT NULL,
  email varchar(150) NOT NULL CONSTRAINT usuarios_email_key UNIQUE,
  senha_hash varchar(255) NOT NULL,
  cargo varchar(50) NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT usuarios_cargo_check CHECK (cargo IN ('administrador', 'gestor_animais', 'financeiro', 'voluntariado'))
);

CREATE TABLE animais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(100) NOT NULL,
  especie varchar(30) NOT NULL,
  raca varchar(100),
  sexo varchar(10),
  idade_anos numeric(4, 1),
  porte varchar(20),
  status varchar(20) DEFAULT 'disponivel' NOT NULL,
  descricao text,
  foto_url text,
  data_entrada date DEFAULT CURRENT_DATE NOT NULL,
  castrado boolean DEFAULT false NOT NULL,
  vacinado boolean DEFAULT false NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL,
  atualizado_em timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT animais_especie_check CHECK (especie IN ('cachorro', 'gato', 'outro')),
  CONSTRAINT animais_porte_check CHECK (porte IN ('pequeno', 'medio', 'grande')),
  CONSTRAINT animais_sexo_check CHECK (sexo IN ('macho', 'femea')),
  CONSTRAINT animais_status_check CHECK (status IN ('disponivel', 'em_processo', 'adotado', 'urgente', 'inativo'))
);

CREATE TABLE adotantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(150) NOT NULL,
  email varchar(150) NOT NULL CONSTRAINT adotantes_email_key UNIQUE,
  telefone varchar(20),
  cidade varchar(100),
  estado char(2),
  endereco text,
  status varchar(20) DEFAULT 'em_analise' NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT adotantes_status_check CHECK (status IN ('em_analise', 'visita_agendada', 'adotante', 'inativo'))
);

CREATE TABLE pedidos_adocao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL,
  adotante_id uuid NOT NULL,
  responsavel_id uuid,
  status varchar(20) DEFAULT 'novo' NOT NULL,
  prioridade varchar(10) DEFAULT 'medio',
  observacoes text,
  termo_assinado boolean DEFAULT false NOT NULL,
  termo_assinado_em timestamptz,
  data_pedido timestamptz DEFAULT now() NOT NULL,
  atualizado_em timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT pedidos_adocao_prioridade_check CHECK (prioridade IN ('alto', 'medio', 'baixo')),
  CONSTRAINT pedidos_adocao_status_check CHECK (status IN ('novo', 'em_analise', 'visita_agendada', 'aprovado', 'reprovado'))
);

CREATE TABLE doacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adotante_id uuid,
  doador_nome varchar(150) NOT NULL,
  doador_email varchar(150),
  tipo varchar(20) NOT NULL,
  valor numeric(10, 2) NOT NULL,
  metodo varchar(30),
  status varchar(20) DEFAULT 'confirmada' NOT NULL,
  data timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT doacoes_metodo_check CHECK (metodo IN ('pix', 'cartao', 'boleto', 'transferencia')),
  CONSTRAINT doacoes_status_check CHECK (status IN ('pendente', 'confirmada', 'cancelada')),
  CONSTRAINT doacoes_tipo_check CHECK (tipo IN ('unica', 'recorrente')),
  CONSTRAINT doacoes_valor_check CHECK (valor > 0)
);

CREATE TABLE historias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid,
  adotante_id uuid,
  autor_nome varchar(150) NOT NULL,
  texto text NOT NULL,
  foto_url text,
  publicado boolean DEFAULT false NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE voluntarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(150) NOT NULL,
  email varchar(150) NOT NULL CONSTRAINT voluntarios_email_key UNIQUE,
  telefone varchar(20),
  status varchar(20) DEFAULT 'ativo' NOT NULL,
  data_inicio date DEFAULT CURRENT_DATE NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT voluntarios_status_check CHECK (status IN ('ativo', 'inativo'))
);

CREATE TABLE voluntario_areas (
  voluntario_id uuid,
  area varchar(50),
  CONSTRAINT voluntario_areas_pkey PRIMARY KEY (voluntario_id, area),
  CONSTRAINT voluntario_areas_area_check CHECK (area IN (
    'passeios', 'banho_e_tosa', 'divulgacao', 'eventos', 'transporte',
    'fotografia', 'socializacao', 'captacao', 'manutencao'
  ))
);

CREATE INDEX idx_adotantes_status ON adotantes (status);
CREATE INDEX idx_animais_especie ON animais (especie);
CREATE INDEX idx_animais_status ON animais (status);
CREATE INDEX idx_doacoes_data ON doacoes (data);
CREATE INDEX idx_doacoes_tipo ON doacoes (tipo);
CREATE INDEX idx_pedidos_adotante ON pedidos_adocao (adotante_id);
CREATE INDEX idx_pedidos_animal ON pedidos_adocao (animal_id);
CREATE INDEX idx_pedidos_status ON pedidos_adocao (status);

ALTER TABLE doacoes ADD CONSTRAINT doacoes_adotante_id_fkey
  FOREIGN KEY (adotante_id) REFERENCES adotantes (id) ON DELETE SET NULL;
ALTER TABLE historias ADD CONSTRAINT historias_adotante_id_fkey
  FOREIGN KEY (adotante_id) REFERENCES adotantes (id) ON DELETE SET NULL;
ALTER TABLE historias ADD CONSTRAINT historias_animal_id_fkey
  FOREIGN KEY (animal_id) REFERENCES animais (id) ON DELETE SET NULL;
ALTER TABLE pedidos_adocao ADD CONSTRAINT pedidos_adocao_adotante_id_fkey
  FOREIGN KEY (adotante_id) REFERENCES adotantes (id) ON DELETE CASCADE;
ALTER TABLE pedidos_adocao ADD CONSTRAINT pedidos_adocao_animal_id_fkey
  FOREIGN KEY (animal_id) REFERENCES animais (id) ON DELETE RESTRICT;
ALTER TABLE pedidos_adocao ADD CONSTRAINT pedidos_adocao_responsavel_id_fkey
  FOREIGN KEY (responsavel_id) REFERENCES usuarios (id) ON DELETE SET NULL;
ALTER TABLE voluntario_areas ADD CONSTRAINT voluntario_areas_voluntario_id_fkey
  FOREIGN KEY (voluntario_id) REFERENCES voluntarios (id) ON DELETE CASCADE;

-- atualizado_em é mantido pelo banco; a aplicação nunca escreve esse campo.
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_animais_atualizado
  BEFORE UPDATE ON animais
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_pedidos_atualizado
  BEFORE UPDATE ON pedidos_adocao
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE VIEW vw_doacoes_por_mes AS
  SELECT date_trunc('month', data) AS mes, sum(valor) AS total, count(*) AS quantidade
  FROM doacoes
  WHERE status = 'confirmada'
  GROUP BY date_trunc('month', data)
  ORDER BY date_trunc('month', data);

CREATE VIEW vw_kpis_gerais AS
  SELECT
    (SELECT count(*) FROM animais) AS total_animais,
    (SELECT count(*) FROM animais WHERE status = 'adotado') AS total_adocoes,
    (SELECT count(*) FROM pedidos_adocao WHERE status NOT IN ('aprovado', 'reprovado')) AS pedidos_pendentes,
    (SELECT COALESCE(sum(valor), 0) FROM doacoes
      WHERE status = 'confirmada' AND date_trunc('month', data) = date_trunc('month', now())) AS doacoes_mes_atual;
