const pool = require('../../db/db');

const PUBLIC_COLUMNS = 'id, nome, email, cargo, ativo, criado_em';
const SORT_COLUMNS = Object.freeze({ nome: 'nome', email: 'email', cargo: 'cargo', criado_em: 'criado_em' });

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
  const conditions = [];
  const values = [];

  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`(nome ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }
  if (filters.cargo) {
    values.push(filters.cargo);
    conditions.push(`cargo = $${values.length}`);
  }
  if (filters.ativo !== undefined) {
    values.push(filters.ativo);
    conditions.push(`ativo = $${values.length}`);
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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
  const allowedColumns = new Set(['nome', 'email', 'cargo', 'ativo']);
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  if (entries.length === 0) return findById(id);

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await pool.query(
    `UPDATE usuarios SET ${assignments.join(', ')} WHERE id = $${values.length}
     RETURNING ${PUBLIC_COLUMNS}`,
    values
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
