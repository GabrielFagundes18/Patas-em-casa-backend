const pool = require('../../db/db');
const { buildUpdate, createWhere } = require('../../db/sql');
const { adoptionRequest } = require('../../config/domain-values');

const SORT_COLUMNS = Object.freeze({
  nome: 'd.nome',
  criado_em: 'd.criado_em',
  cidade: 'd.cidade',
  status: 'd.status',
});

const ANONYMIZED_NAME = 'Titular anonimizado';
const REMOVED_TEXT = '[conteúdo removido a pedido do titular (LGPD)]';

const UPDATABLE_COLUMNS = new Set(['nome', 'email', 'telefone', 'cidade', 'estado', 'endereco', 'status']);

function buildWhere(filters) {
  const where = createWhere();

  if (filters.q) {
    const digits = filters.q.replace(/\D/g, '');
    const text = where.param(`%${filters.q}%`);
    const phoneCondition = digits.length >= 4
      ? ` OR regexp_replace(COALESCE(d.telefone, ''), '\\D', '', 'g') LIKE ${where.param(`%${digits}%`)}`
      : '';
    where.addRaw(`(d.nome ILIKE ${text} OR d.email ILIKE ${text}${phoneCondition})`);
  }
  if (filters.status) where.add('d.status = ?', filters.status);
  if (filters.cidade) where.add('d.cidade ILIKE ?', filters.cidade);
  if (filters.estado) where.add('d.estado = ?', filters.estado);

  return { clause: where.clause(), values: where.values };
}

const SELECT_WITH_COUNTS = `
  SELECT d.id, d.nome, d.email, d.telefone, d.cidade, d.estado, d.status, d.criado_em,
         (d.endereco IS NOT NULL) AS possui_endereco,
         COUNT(p.id)::int AS total_pedidos,
         COUNT(p.id) FILTER (WHERE p.status = ANY('{${adoptionRequest.openStatus.join(',')}}'::varchar[]))::int AS pedidos_abertos
  FROM adotantes d
  LEFT JOIN pedidos_adocao p ON p.adotante_id = d.id`;

async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.criado_em;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM adotantes d ${clause}`, values);
  const result = await pool.query(
    `${SELECT_WITH_COUNTS}
     ${clause}
     GROUP BY d.id
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, d.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

async function listForExport(filters, maxRows) {
  const { clause, values } = buildWhere(filters);
  const result = await pool.query(
    `${SELECT_WITH_COUNTS}
     ${clause}
     GROUP BY d.id
     ORDER BY d.nome ASC, d.id ASC
     LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

async function findById(db = pool, id, { forUpdate = false } = {}) {
  const result = await db.query(
    `SELECT id, nome, email, telefone, cidade, estado, endereco, status, criado_em
     FROM adotantes WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id]
  );
  return result.rows[0] || null;
}

async function findHistory(db = pool, id) {
  const [requests, donations, stories] = await Promise.all([
    db.query(
      `SELECT p.id, p.status, p.prioridade, p.observacoes, p.termo_assinado, p.termo_assinado_em,
              p.data_pedido, p.atualizado_em,
              a.id AS animal_id, a.nome AS animal_nome, a.especie AS animal_especie
       FROM pedidos_adocao p
       JOIN animais a ON a.id = p.animal_id
       WHERE p.adotante_id = $1
       ORDER BY p.data_pedido DESC`,
      [id]
    ),
    db.query(
      `SELECT id, doador_nome, doador_email, tipo, valor, metodo, status, data
       FROM doacoes WHERE adotante_id = $1 ORDER BY data DESC`,
      [id]
    ),
    db.query(
      `SELECT id, animal_id, autor_nome, texto, foto_url, publicado, criado_em
       FROM historias WHERE adotante_id = $1 ORDER BY criado_em DESC`,
      [id]
    ),
  ]);

  return { pedidos: requests.rows, doacoes: donations.rows, historias: stories.rows };
}

async function update(id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return findById(pool, id);

  const result = await pool.query(
    `UPDATE adotantes SET ${update.set} WHERE id = ${update.idParam}
     RETURNING id, nome, email, telefone, cidade, estado, endereco, status, criado_em`,
    update.values
  );
  return result.rows[0] || null;
}

async function countOpenRequests(db, id) {
  const result = await db.query(
    'SELECT COUNT(*)::int AS total FROM pedidos_adocao WHERE adotante_id = $1 AND status = ANY($2::varchar[])',
    [id, adoptionRequest.openStatus]
  );
  return result.rows[0].total;
}

// Remove dados pessoais vinculados ao titular em doações, histórias e pedidos,
// mantendo os registros (e as estatísticas) sem identificação.
async function scrubLinkedRecords(db, id) {
  await db.query(
    "UPDATE doacoes SET doador_nome = 'Doador anonimizado', doador_email = NULL WHERE adotante_id = $1",
    [id]
  );
  await db.query(
    "UPDATE historias SET autor_nome = 'Autor anonimizado', publicado = false WHERE adotante_id = $1",
    [id]
  );
  await db.query('UPDATE pedidos_adocao SET observacoes = $2 WHERE adotante_id = $1', [id, REMOVED_TEXT]);
}

async function anonymize(db, id) {
  await scrubLinkedRecords(db, id);
  await db.query(
    `UPDATE adotantes
     SET nome = $2, email = 'anonimizado-' || id || '@anonimizado.invalid',
         telefone = NULL, cidade = NULL, estado = NULL, endereco = NULL, status = 'inativo'
     WHERE id = $1`,
    [id, ANONYMIZED_NAME]
  );
}

async function remove(db, id) {
  await scrubLinkedRecords(db, id);
  const result = await db.query('DELETE FROM adotantes WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

module.exports = {
  ANONYMIZED_NAME,
  list,
  listForExport,
  findById,
  findHistory,
  update,
  countOpenRequests,
  anonymize,
  remove,
};
