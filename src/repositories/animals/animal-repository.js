const pool = require('../../db/db');

const SORT_COLUMNS = Object.freeze({
  nome: 'nome',
  data_entrada: 'data_entrada',
  idade_anos: 'idade_anos',
  status: 'status',
  especie: 'especie',
  porte: 'porte',
});

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  }

  if (filters.q) addCondition("(nome ILIKE ? OR COALESCE(raca, '') ILIKE ?)", `%${filters.q}%`);
  if (filters.especie) addCondition('especie = ?', filters.especie);
  if (filters.sexo) addCondition('sexo = ?', filters.sexo);
  if (filters.porte) addCondition('porte = ?', filters.porte);
  if (filters.status) addCondition('status = ?', filters.status);
  if (filters.statusIn?.length) addCondition('status = ANY(?::varchar[])', filters.statusIn);
  if (filters.castrado !== undefined) addCondition('castrado = ?', filters.castrado);
  if (filters.vacinado !== undefined) addCondition('vacinado = ?', filters.vacinado);
  if (filters.idadeMin !== undefined) addCondition('idade_anos >= ?', filters.idadeMin);
  if (filters.idadeMax !== undefined) addCondition('idade_anos <= ?', filters.idadeMax);

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
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
    `SELECT id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
            foto_url, data_entrada, castrado, vacinado, criado_em, atualizado_em
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
    `SELECT id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
            foto_url, data_entrada, castrado, vacinado, criado_em, atualizado_em
     FROM animais ${clause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
     LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
            foto_url, data_entrada, castrado, vacinado, criado_em, atualizado_em
     FROM animais WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function create(animal) {
  const result = await pool.query(
    `INSERT INTO animais
      (nome, especie, raca, sexo, idade_anos, porte, status, descricao, foto_url,
       data_entrada, castrado, vacinado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
               foto_url, data_entrada, castrado, vacinado, criado_em, atualizado_em`,
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
    ]
  );
  return result.rows[0];
}

async function update(id, changes) {
  const allowedColumns = new Set([
    'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
    'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado',
  ]);
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  if (entries.length === 0) return findById(id);

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await pool.query(
    `UPDATE animais SET ${assignments.join(', ')} WHERE id = $${values.length}
     RETURNING id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
               foto_url, data_entrada, castrado, vacinado, criado_em, atualizado_em`,
    values
  );
  return result.rows[0] || null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM animais WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { list, listForExport, findById, create, update, remove };