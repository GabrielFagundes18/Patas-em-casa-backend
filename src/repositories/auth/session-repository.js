const pool = require('../../db/db');

// Sessões do painel (migration 010). O cookie de renovação carrega o id da sessão; revogar aqui
// derruba o acesso mesmo que o token ainda não tenha expirado.
async function create({ usuarioId, agenteUsuario, expiraEm }) {
  const result = await pool.query(
    'INSERT INTO sessoes (usuario_id, agente_usuario, expira_em) VALUES ($1, $2, $3) RETURNING id',
    [usuarioId, agenteUsuario || null, expiraEm]
  );
  return result.rows[0].id;
}

async function findActive(id) {
  const result = await pool.query(
    'SELECT id, usuario_id FROM sessoes WHERE id = $1 AND revogado_em IS NULL AND expira_em > now()',
    [id]
  );
  return result.rows[0] || null;
}

async function touch(id) {
  await pool.query('UPDATE sessoes SET ultimo_uso_em = now() WHERE id = $1', [id]);
}

async function revoke(id) {
  await pool.query('UPDATE sessoes SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL', [id]);
}

async function revokeAllForUser(usuarioId, { exceptId = null, db = pool } = {}) {
  await db.query(
    `UPDATE sessoes SET revogado_em = now()
     WHERE usuario_id = $1 AND revogado_em IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [usuarioId, exceptId]
  );
}

module.exports = { create, findActive, touch, revoke, revokeAllForUser };
