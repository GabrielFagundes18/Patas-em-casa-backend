const pool = require('../../db/db');

async function kpis() {
  const result = await pool.query('SELECT * FROM vw_kpis_gerais');
  return result.rows[0];
}

async function animalsByStatus() {
  const result = await pool.query('SELECT status, COUNT(*)::int AS total FROM animais GROUP BY status ORDER BY status');
  return result.rows;
}

async function animalHealth() {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE vacinado)::int AS vacinados,
            COUNT(*) FILTER (WHERE castrado)::int AS castrados,
            COUNT(*) FILTER (WHERE status = 'adotado')::int AS adotados
     FROM animais`
  );
  return result.rows[0];
}

async function requestsByStatus() {
  const result = await pool.query('SELECT status, COUNT(*)::int AS total FROM pedidos_adocao GROUP BY status ORDER BY status');
  return result.rows;
}

// Sem coluna de data de decisão no schema atual, a data da aprovação é aproximada por
// atualizado_em do pedido aprovado (a migração 004 adiciona os campos de decisão).
async function adoptionsByMonth(months) {
  const result = await pool.query(
    `SELECT date_trunc('month', atualizado_em) AS mes, COUNT(*)::int AS total
     FROM pedidos_adocao
     WHERE status = 'aprovado'
       AND atualizado_em >= date_trunc('month', now()) - make_interval(months => $1 - 1)
     GROUP BY 1
     ORDER BY 1`,
    [months]
  );
  return result.rows;
}

async function adoptionTotals() {
  const result = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE atualizado_em >= date_trunc('month', now()))::int AS mes,
            COUNT(*) FILTER (WHERE atualizado_em >= date_trunc('year', now()))::int AS ano
     FROM pedidos_adocao
     WHERE status = 'aprovado'`
  );
  return result.rows[0];
}

async function donationsByMonth(months) {
  const result = await pool.query(
    `SELECT mes, total, quantidade
     FROM vw_doacoes_por_mes
     WHERE mes >= date_trunc('month', now()) - make_interval(months => $1 - 1)
     ORDER BY mes`,
    [months]
  );
  return result.rows;
}

async function donationsByMethod(months) {
  const result = await pool.query(
    `SELECT COALESCE(metodo, 'nao_informado') AS metodo, COUNT(*)::int AS quantidade, SUM(valor) AS total
     FROM doacoes
     WHERE status = 'confirmada'
       AND data >= date_trunc('month', now()) - make_interval(months => $1 - 1)
     GROUP BY 1
     ORDER BY 1`,
    [months]
  );
  return result.rows;
}

async function urgentAnimals(limit) {
  const result = await pool.query(
    `SELECT id, nome, especie, foto_url, data_entrada
     FROM animais WHERE status = 'urgente'
     ORDER BY data_entrada ASC, nome ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function recentRequests(limit) {
  const result = await pool.query(
    `SELECT p.id, p.status, p.prioridade, p.data_pedido,
            a.id AS animal_id, a.nome AS animal_nome, d.nome AS adotante_nome
     FROM pedidos_adocao p
     JOIN animais a ON a.id = p.animal_id
     JOIN adotantes d ON d.id = p.adotante_id
     WHERE p.status = 'novo'
     ORDER BY p.data_pedido DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// Agenda possível com o schema atual: pedidos em "visita agendada" (sem data marcada,
// que chega com a migração 004) e termos de adoção pendentes de assinatura.
async function agenda(limit) {
  const result = await pool.query(
    `SELECT p.id AS pedido_id,
            CASE WHEN p.status = 'visita_agendada' THEN 'visita' ELSE 'termo_pendente' END AS tipo,
            p.atualizado_em AS referencia_em,
            a.nome AS animal_nome, d.nome AS adotante_nome, u.nome AS responsavel_nome
     FROM pedidos_adocao p
     JOIN animais a ON a.id = p.animal_id
     JOIN adotantes d ON d.id = p.adotante_id
     LEFT JOIN usuarios u ON u.id = p.responsavel_id
     WHERE p.status = 'visita_agendada' OR (p.status = 'aprovado' AND p.termo_assinado = false)
     ORDER BY p.atualizado_em ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// Números públicos da home: só contagens agregadas, nenhum dado pessoal.
async function publicNumbers() {
  const result = await pool.query(
    `SELECT k.total_animais, k.total_adocoes,
            (SELECT COUNT(*) FROM animais WHERE status IN ('disponivel', 'urgente')) AS aguardando_lar
     FROM vw_kpis_gerais k`
  );
  return result.rows[0];
}

module.exports = {
  publicNumbers,
  kpis,
  animalsByStatus,
  animalHealth,
  requestsByStatus,
  adoptionsByMonth,
  adoptionTotals,
  donationsByMonth,
  donationsByMethod,
  urgentAnimals,
  recentRequests,
  agenda,
};
