const pool = require('../../db/pool');
const { buildUpdate, createWhere } = require('../../db/sql');
const { adoptionRequest } = require('../../config/domain-values');

const SELECT_REQUEST = `
  SELECT p.id, p.status, p.prioridade, p.observacoes, p.termo_assinado, p.termo_assinado_em, p.visita_preferida_em,
         p.data_pedido, p.atualizado_em,
         a.id AS animal_id, a.nome AS animal_nome, a.especie AS animal_especie,
         a.status AS animal_status, a.foto_url AS animal_foto_url,
         d.id AS adotante_id, d.nome AS adotante_nome, d.email AS adotante_email,
         d.telefone AS adotante_telefone, d.cidade AS adotante_cidade, d.estado AS adotante_estado,
         d.status AS adotante_status,
         u.id AS responsavel_id, u.nome AS responsavel_nome
  FROM pedidos_adocao p
  JOIN animais a ON a.id = p.animal_id
  JOIN adotantes d ON d.id = p.adotante_id
  LEFT JOIN usuarios u ON u.id = p.responsavel_id`;

const SORT_EXPRESSIONS = Object.freeze({
  data_pedido: 'p.data_pedido',
  atualizado_em: 'p.atualizado_em',
  status: 'p.status',
  prioridade: "CASE p.prioridade WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END",
});

const UPDATABLE_COLUMNS = new Set([
  'status', 'prioridade', 'responsavel_id', 'observacoes', 'termo_assinado', 'termo_assinado_em',
]);

function buildWhere(filters) {
  const where = createWhere();

  if (filters.status?.length) where.add('p.status = ANY(?::varchar[])', filters.status);
  if (filters.prioridade) where.add('p.prioridade = ?', filters.prioridade);
  if (filters.responsavelId) where.add('p.responsavel_id = ?', filters.responsavelId);
  if (filters.semResponsavel) where.addRaw('p.responsavel_id IS NULL');
  if (filters.animalId) where.add('p.animal_id = ?', filters.animalId);
  if (filters.adotanteId) where.add('p.adotante_id = ?', filters.adotanteId);
  if (filters.q) where.add('(d.nome ILIKE ? OR a.nome ILIKE ?)', `%${filters.q}%`);
  if (filters.de) where.add('p.data_pedido >= ?::date', filters.de);
  if (filters.ate) where.add("p.data_pedido < ?::date + interval '1 day'", filters.ate);

  return { clause: where.clause(), values: where.values };
}

async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortExpression = SORT_EXPRESSIONS[filters.sort] || SORT_EXPRESSIONS.data_pedido;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM pedidos_adocao p
     JOIN animais a ON a.id = p.animal_id
     JOIN adotantes d ON d.id = p.adotante_id
     ${clause}`,
    values
  );
  const result = await pool.query(
    `${SELECT_REQUEST}
     ${clause}
     ORDER BY ${sortExpression} ${sortOrder}, p.data_pedido DESC, p.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

async function findById(db = pool, id, { forUpdate = false } = {}) {
  const result = await db.query(
    `${SELECT_REQUEST} WHERE p.id = $1 ${forUpdate ? 'FOR UPDATE OF p' : ''}`,
    [id]
  );
  return result.rows[0] || null;
}

async function update(db, id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return;

  await db.query(`UPDATE pedidos_adocao SET ${update.set} WHERE id = ${update.idParam}`, update.values);
}

async function lockAnimal(db, animalId) {
  const result = await db.query('SELECT id, nome, status FROM animais WHERE id = $1 FOR UPDATE', [animalId]);
  return result.rows[0] || null;
}

async function setAnimalStatus(db, animalId, status) {
  await db.query('UPDATE animais SET status = $1 WHERE id = $2', [status, animalId]);
}

async function setAdopterStatus(db, adopterId, status) {
  await db.query('UPDATE adotantes SET status = $1 WHERE id = $2', [status, adopterId]);
}

async function lockOpenRequestsForAnimal(db, animalId, excludeId) {
  const result = await db.query(
    `SELECT id, adotante_id, status, observacoes
     FROM pedidos_adocao
     WHERE animal_id = $1 AND id <> $2 AND status = ANY($3::varchar[])
     FOR UPDATE`,
    [animalId, excludeId, adoptionRequest.openStatus]
  );
  return result.rows;
}

async function countOpenRequestsForAdopter(db, adopterId, excludeId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM pedidos_adocao
     WHERE adotante_id = $1 AND id <> $2 AND status = ANY($3::varchar[])`,
    [adopterId, excludeId, adoptionRequest.openStatus]
  );
  return result.rows[0].total;
}

async function findActiveUser(db, id) {
  const result = await db.query('SELECT id, nome, cargo FROM usuarios WHERE id = $1 AND ativo = true', [id]);
  return result.rows[0] || null;
}

module.exports = {
  list,
  findById,
  update,
  lockAnimal,
  setAnimalStatus,
  setAdopterStatus,
  lockOpenRequestsForAnimal,
  countOpenRequestsForAdopter,
  findActiveUser,
};
