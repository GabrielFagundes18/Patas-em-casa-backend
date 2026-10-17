/*
 * ============================================================================
 * ARQUIVO: user-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY dos USUÁRIOS DO PAINEL (tabela "usuarios"): buscas (por e-mail,
 *   por id, com ou sem o hash da senha), lista com filtros, criação, edição,
 *   troca de senha e contagem de administradores ativos.
 *   O hash da senha só é lido nas funções que realmente precisam dele (login e
 *   troca de senha); as demais usam PUBLIC_COLUMNS.
 *
 * PRINCIPAIS ITENS:
 *   - PUBLIC_COLUMNS, SORT_COLUMNS, UPDATABLE_COLUMNS.
 *   - findByEmail, findById, findByIdWithPassword, list, create, update,
 *     updatePassword, countActiveAdministrators.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool e db/sql.
 *   - Usado por: ./user-service.js, auth/auth-service.js, middleware/auth.js e scripts/definir-senha.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL.
const { buildUpdate, createWhere } = require('../../db/sql');

// Colunas seguras (sem o hash da senha).
const PUBLIC_COLUMNS = 'id, nome, email, cargo, ativo, criado_em';
// Ordenações permitidas.
const SORT_COLUMNS = Object.freeze({ nome: 'nome', email: 'email', cargo: 'cargo', criado_em: 'criado_em' });
// Colunas editáveis (a senha tem função própria).
const UPDATABLE_COLUMNS = new Set(['nome', 'email', 'cargo', 'ativo']);

/*
 * findByEmail (async): usuário pelo e-mail (sem diferenciar maiúsculas), COM o hash da senha (login).
 */
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

/*
 * findById (async): usuário pelo id, SEM a senha.
 */
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

/*
 * findByIdWithPassword (async): usuário pelo id COM o hash (troca da própria senha).
 */
async function findByIdWithPassword(id) {
  const result = await pool.query(
    'SELECT id, nome, email, senha_hash, cargo, ativo FROM usuarios WHERE id = $1 LIMIT 1',
    [id]
  );

  return result.rows[0] || null;
}

/*
 * list (async): busca (nome/e-mail), cargo e ativo; ordenação padrão por nome (A→Z).
 * Retorno: { items, total }.
 */
async function list(filters) {
  const where = createWhere();
  if (filters.q) where.add('(nome ILIKE ? OR email ILIKE ?)', `%${filters.q}%`);
  if (filters.cargo) where.add('cargo = ?', filters.cargo);
  if (filters.ativo !== undefined) where.add('ativo = ?', filters.ativo);

  const clause = where.clause();
  const { values } = where;
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.nome;
  // Aqui o padrão é crescente (só "desc" inverte).
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

/*
 * create (async): cria o usuário (com o hash da senha já calculado) e devolve os dados públicos.
 */
async function create(user) {
  const result = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, cargo, ativo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [user.nome, user.email, user.senhaHash, user.cargo, user.ativo]
  );
  return result.rows[0];
}

/*
 * update (async): atualização parcial (nome, e-mail, cargo, ativo).
 */
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

/*
 * updatePassword (async): grava o novo hash. "db" permite usar dentro de uma transação.
 * Retorno (boolean): true se encontrou o usuário.
 */
async function updatePassword(id, senhaHash, db = pool) {
  const result = await db.query(
    'UPDATE usuarios SET senha_hash = $1 WHERE id = $2 RETURNING id',
    [senhaHash, id]
  );
  return result.rowCount > 0;
}

/*
 * countActiveAdministrators (async): quantos administradores ativos existem
 * (para impedir que o último seja rebaixado ou desativado).
 */
async function countActiveAdministrators() {
  const result = await pool.query(
    "SELECT COUNT(*)::int AS total FROM usuarios WHERE cargo = 'administrador' AND ativo = true"
  );
  return result.rows[0].total;
}

// Exporta as funções.
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

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Login usa findByEmail; o middleware de autenticação usa findById a cada
 *   requisição; a gestão da equipe usa list/create/update/updatePassword; a regra
 *   do "último administrador" usa countActiveAdministrators.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Nunca devolver o hash da senha sem necessidade (princípio do menor privilégio nos dados).
 *   - Buscas sem diferenciar maiúsculas (LOWER).
 *   - Repository com parâmetro "db" opcional para transações.
 * ============================================================================
 */
