const pool = require('../../db/db');
const { buildUpdate, createWhere } = require('../../db/sql');

const PUBLIC_COLUMNS = 'id, nome, email, cargo, ativo, criado_em';
const SORT_COLUMNS = Object.freeze({ nome: 'nome', email: 'email', cargo: 'cargo', criado_em: 'criado_em' });
const UPDATABLE_COLUMNS = new Set(['nome', 'email', 'cargo', 'ativo']);

async function findByEmail(email) {
  const result = await pool.query(
    `SELECT id, nome, email, senha_hash, cargo, ativo
     FROM usuarios
     WHERE LOWER(email) = $1
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
}

async function findById(id) {
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM usuarios
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findByIdWithPassword(id) {
  const result = await pool.query(
    'SELECT id, nome, email, senha_hash, cargo, ativo FROM usuarios WHERE id = $1 LIMIT 1',
    [id]
  );

  return result.rows[0] || null;
}

async function list(filters) {
  const where = createWhere();
  if (filters.q) where.add('(nome ILIKE ? OR email ILIKE ?)', `%${filters.q}%`);
  if (filters.cargo) where.add('cargo = ?', filters.cargo);
  if (filters.ativo !== undefined) where.add('ativo = ?', filters.ativo);

  const clause = where.clause();
  const { values } = where;
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.nome;
  const sortOrder = filters.order === 'desc' ? 'DESC' : 'ASC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM usuarios ${clause}`, values);
  const result = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM usuarios ${clause}
     ORDER BY ${sortColumn} ${sortOrder}, id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

async function create(user) {
  const result = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, cargo, ativo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [user.nome, user.email, user.senhaHash, user.cargo, user.ativo]
  );
  return result.rows[0];
}

async function update(id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return findById(id);

  const result = await pool.query(
    `UPDATE usuarios SET ${update.set} WHERE id = ${update.idParam}
     RETURNING ${PUBLIC_COLUMNS}`,
    update.values
  );
  return result.rows[0] || null;
}

async function updatePassword(id, senhaHash) {
  const result = await pool.query(
    'UPDATE usuarios SET senha_hash = $1 WHERE id = $2 RETURNING id',
    [senhaHash, id]
  );
  return result.rowCount > 0;
}

async function countActiveAdministrators() {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS total FROM usuarios WHERE cargo = 'administrador' AND ativo = true"
  );
  return result.rows[0].total;
}

module.exports = {
  findByEmail,
  findById,
  findByIdWithPassword,
  list,
  create,
  update,
  updatePassword,
  countActiveAdministrators,
};
