const pool = require('../../db/db');

const SELECT_STORY = `
  SELECT h.id, h.autor_nome, h.texto, h.foto_url, h.publicado, h.criado_em,
         h.animal_id, a.nome AS animal_nome, h.adotante_id, d.nome AS adotante_nome
  FROM historias h
  LEFT JOIN animais a ON a.id = h.animal_id
  LEFT JOIN adotantes d ON d.id = h.adotante_id`;

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  }

  if (filters.q) addCondition('(h.autor_nome ILIKE ? OR h.texto ILIKE ?)', `%${filters.q}%`);
  if (filters.publicado !== undefined) addCondition('h.publicado = ?', filters.publicado);
  if (filters.animalId) addCondition('h.animal_id = ?', filters.animalId);

  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM historias h ${clause}`, values);
  const result = await pool.query(
    `${SELECT_STORY}
     ${clause}
     ORDER BY h.criado_em ${sortOrder}, h.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

async function findById(id) {
  const result = await pool.query(`${SELECT_STORY} WHERE h.id = $1`, [id]);
  return result.rows[0] || null;
}

async function create(story) {
  const result = await pool.query(
    `INSERT INTO historias (autor_nome, texto, foto_url, publicado, animal_id, adotante_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [story.autor_nome, story.texto, story.foto_url, story.publicado, story.animal_id, story.adotante_id]
  );
  return findById(result.rows[0].id);
}

async function update(id, changes) {
  const allowedColumns = new Set(['autor_nome', 'texto', 'foto_url', 'publicado', 'animal_id', 'adotante_id']);
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  if (entries.length === 0) return findById(id);

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await pool.query(`UPDATE historias SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
  return result.rowCount > 0 ? findById(id) : null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM historias WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// Site público: só histórias publicadas e nenhum dado do adotante vinculado.
async function listPublished(filters) {
  const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM historias WHERE publicado = true');
  const result = await pool.query(
    `SELECT h.id, h.autor_nome, h.texto, h.foto_url, h.criado_em,
            a.id AS animal_id, a.nome AS animal_nome, a.especie AS animal_especie, a.foto_url AS animal_foto_url
     FROM historias h
     LEFT JOIN animais a ON a.id = h.animal_id
     WHERE h.publicado = true
     ORDER BY h.criado_em DESC, h.id ASC
     LIMIT $1 OFFSET $2`,
    [filters.pageSize, filters.offset]
  );
  return { items: result.rows, total: countResult.rows[0].total };
}

module.exports = { list, findById, create, update, remove, listPublished };
