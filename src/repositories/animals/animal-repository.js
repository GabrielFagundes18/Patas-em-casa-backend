const pool = require('../../db/db');
const { buildUpdate, createWhere } = require('../../db/sql');

const SORT_COLUMNS = Object.freeze({
  nome: 'nome',
  data_entrada: 'data_entrada',
  idade_anos: 'idade_anos',
  status: 'status',
  especie: 'especie',
  porte: 'porte',
});

const ANIMAL_COLUMNS = `id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
  foto_url, data_entrada, castrado, vacinado, temperamento, criado_em, atualizado_em`;

const UPDATABLE_COLUMNS = new Set([
  'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado', 'temperamento',
]);

function buildWhere(filters) {
  const where = createWhere();

  if (filters.q) where.add("(nome ILIKE ? OR COALESCE(raca, '') ILIKE ?)", `%${filters.q}%`);
  if (filters.especie) where.add('especie = ?', filters.especie);
  if (filters.sexo) where.add('sexo = ?', filters.sexo);
  if (filters.porte) where.add('porte = ?', filters.porte);
  if (filters.status) where.add('status = ?', filters.status);
  if (filters.statusIn?.length) where.add('status = ANY(?::varchar[])', filters.statusIn);
  if (filters.castrado !== undefined) where.add('castrado = ?', filters.castrado);
  if (filters.vacinado !== undefined) where.add('vacinado = ?', filters.vacinado);
  if (filters.idadeMin !== undefined) where.add('idade_anos >= ?', filters.idadeMin);
  if (filters.idadeMax !== undefined) where.add('idade_anos <= ?', filters.idadeMax);

  return { clause: where.clause(), values: where.values };
}

async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM animais ${clause}`,
    values
  );
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.data_entrada;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';
  const result = await pool.query(
    `SELECT ${ANIMAL_COLUMNS}
     FROM animais ${clause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

async function listForExport(filters, maxRows) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.data_entrada;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';
  const result = await pool.query(
    `SELECT ${ANIMAL_COLUMNS}
     FROM animais ${clause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
     LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT ${ANIMAL_COLUMNS}
     FROM animais WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function create(animal) {
  const result = await pool.query(
    `INSERT INTO animais
      (nome, especie, raca, sexo, idade_anos, porte, status, descricao, foto_url,
       data_entrada, castrado, vacinado, temperamento)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${ANIMAL_COLUMNS}`,
    [
      animal.nome,
      animal.especie,
      animal.raca,
      animal.sexo,
      animal.idade_anos,
      animal.porte,
      animal.status,
      animal.descricao,
      animal.foto_url,
      animal.data_entrada,
      animal.castrado,
      animal.vacinado,
      animal.temperamento || [],
    ]
  );
  return result.rows[0];
}

async function update(id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return findById(id);

  const result = await pool.query(
    `UPDATE animais SET ${update.set} WHERE id = ${update.idParam}
     RETURNING ${ANIMAL_COLUMNS}`,
    update.values
  );
  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM animais WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { list, listForExport, findById, create, update, remove };