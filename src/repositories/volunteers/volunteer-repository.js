const pool = require('../../db/db');

const SORT_COLUMNS = Object.freeze({
  nome: 'v.nome',
  criado_em: 'v.criado_em',
  data_inicio: 'v.data_inicio',
  status: 'v.status',
});

const SELECT_VOLUNTEER = `
  SELECT v.id, v.nome, v.email, v.telefone, v.status, v.data_inicio, v.criado_em,
         COALESCE(array_agg(va.area ORDER BY va.area) FILTER (WHERE va.area IS NOT NULL), '{}') AS areas
  FROM voluntarios v
  LEFT JOIN voluntario_areas va ON va.voluntario_id = v.id`;

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  }

  if (filters.q) addCondition('(v.nome ILIKE ? OR v.email ILIKE ?)', `%${filters.q}%`);
  if (filters.status) addCondition('v.status = ?', filters.status);
  if (filters.area) {
    addCondition('EXISTS (SELECT 1 FROM voluntario_areas x WHERE x.voluntario_id = v.id AND x.area = ?)', filters.area);
  }

  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.nome;
  const sortOrder = filters.order === 'desc' ? 'DESC' : 'ASC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM voluntarios v ${clause}`, values);
  const result = await pool.query(
    `${SELECT_VOLUNTEER}
     ${clause}
     GROUP BY v.id
     ORDER BY ${sortColumn} ${sortOrder}, v.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

async function findById(db = pool, id) {
  const result = await db.query(`${SELECT_VOLUNTEER} WHERE v.id = $1 GROUP BY v.id`, [id]);
  return result.rows[0] || null;
}

async function findIdByEmail(db, email) {
  const result = await db.query('SELECT id FROM voluntarios WHERE LOWER(email) = $1 LIMIT 1', [email]);
  return result.rows[0]?.id || null;
}

async function create(db, volunteer) {
  const result = await db.query(
    `INSERT INTO voluntarios (nome, email, telefone, status, data_inicio)
     VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))
     RETURNING id`,
    [volunteer.nome, volunteer.email, volunteer.telefone, volunteer.status, volunteer.data_inicio]
  );
  return result.rows[0].id;
}

async function update(db, id, changes) {
  const allowedColumns = new Set(['nome', 'email', 'telefone', 'status', 'data_inicio']);
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  if (entries.length === 0) return true;

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await db.query(`UPDATE voluntarios SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
  return result.rowCount > 0;
}

async function replaceAreas(db, id, areas) {
  await db.query('DELETE FROM voluntario_areas WHERE voluntario_id = $1', [id]);
  if (areas.length > 0) {
    await db.query(
      'INSERT INTO voluntario_areas (voluntario_id, area) SELECT $1, unnest($2::varchar[])',
      [id, areas]
    );
  }
}

async function remove(id) {
  const result = await pool.query('DELETE FROM voluntarios WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

module.exports = { list, findById, findIdByEmail, create, update, replaceAreas, remove };
