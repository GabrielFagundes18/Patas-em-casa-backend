const pool = require('../../db/db');
const { buildUpdate } = require('../../db/sql');

// Agenda de visitas e entrevistas dos pedidos de adoção (migration 011).
const SELECT_APPOINTMENT = `
  SELECT ag.id, ag.pedido_id, ag.tipo, ag.status, ag.previsto_em, ag.duracao_minutos, ag.local, ag.mensagem,
         ag.responsavel_id, u.nome AS responsavel_nome, ag.criado_em, ag.atualizado_em
  FROM pedidos_adocao_agendamentos ag
  LEFT JOIN usuarios u ON u.id = ag.responsavel_id`;

const UPDATABLE_COLUMNS = new Set(['status', 'previsto_em', 'duracao_minutos', 'local', 'mensagem']);

// Trava de agenda até o fim da transação: dois agendamentos simultâneos não passam juntos pela
// verificação de conflito.
async function lockSchedule(db) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('patas_agenda_adocao'))");
}

// Compromissos ativos do mesmo responsável que se sobrepõem a [inicio, inicio + duração).
async function findConflicts(db, { responsavelId, inicio, duracaoMinutos, excludeId = null }) {
  const result = await db.query(
    `SELECT ag.id, ag.tipo, ag.previsto_em, u.nome AS responsavel_nome, d.nome AS adotante_nome
     FROM pedidos_adocao_agendamentos ag
     JOIN pedidos_adocao p ON p.id = ag.pedido_id
     JOIN adotantes d ON d.id = p.adotante_id
     LEFT JOIN usuarios u ON u.id = ag.responsavel_id
     WHERE ag.status = 'agendado'
       AND ag.responsavel_id = $1
       AND ag.previsto_em < $2::timestamptz + make_interval(mins => $3)
       AND ag.previsto_em + make_interval(mins => ag.duracao_minutos) > $2::timestamptz
       AND ($4::uuid IS NULL OR ag.id <> $4::uuid)
     ORDER BY ag.previsto_em
     LIMIT 1`,
    [responsavelId, inicio, duracaoMinutos, excludeId]
  );
  return result.rows;
}

async function create(db, { pedidoId, tipo, previstoEm, duracaoMinutos, local, mensagem, responsavelId }) {
  const result = await db.query(
    `INSERT INTO pedidos_adocao_agendamentos (pedido_id, tipo, previsto_em, duracao_minutos, local, mensagem, responsavel_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [pedidoId, tipo, previstoEm, duracaoMinutos, local || null, mensagem || null, responsavelId || null]
  );
  return findById(db, result.rows[0].id);
}

async function findById(db = pool, id, { forUpdate = false } = {}) {
  const result = await db.query(
    `${SELECT_APPOINTMENT} WHERE ag.id = $1 ${forUpdate ? 'FOR UPDATE OF ag' : ''}`,
    [id]
  );
  return result.rows[0] || null;
}

async function update(db, id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (update) await db.query(`UPDATE pedidos_adocao_agendamentos SET ${update.set} WHERE id = ${update.idParam}`, update.values);
  return findById(db, id);
}

async function listForRequest(db = pool, pedidoId) {
  const result = await db.query(`${SELECT_APPOINTMENT} WHERE ag.pedido_id = $1 ORDER BY ag.previsto_em DESC`, [pedidoId]);
  return result.rows;
}

async function countActiveVisits(db, pedidoId) {
  const result = await db.query(
    "SELECT COUNT(*)::int AS total FROM pedidos_adocao_agendamentos WHERE pedido_id = $1 AND tipo = 'visita' AND status = 'agendado'",
    [pedidoId]
  );
  return result.rows[0].total;
}

// Pedido encerrado (reprovado) não deixa compromisso pendurado na agenda.
async function cancelActiveForRequest(db, pedidoId) {
  const result = await db.query(
    "UPDATE pedidos_adocao_agendamentos SET status = 'cancelado' WHERE pedido_id = $1 AND status = 'agendado'",
    [pedidoId]
  );
  return result.rowCount;
}

module.exports = {
  lockSchedule,
  findConflicts,
  create,
  findById,
  update,
  listForRequest,
  countActiveVisits,
  cancelActiveForRequest,
};
