const pool = require('../../db/pool');

// Links de redefinição de senha e convite (migration 010). Só o hash do token é guardado.
async function invalidatePending(db = pool, usuarioId) {
  await db.query(
    'UPDATE tokens_redefinicao_acesso SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL',
    [usuarioId]
  );
}

async function create(db = pool, { usuarioId, tokenHash, finalidade, expiraEm }) {
  await db.query(
    'INSERT INTO tokens_redefinicao_acesso (usuario_id, token_hash, finalidade, expira_em) VALUES ($1, $2, $3, $4)',
    [usuarioId, tokenHash, finalidade, expiraEm]
  );
}

// Trava o link (FOR UPDATE) para que dois envios simultâneos do mesmo link não usem o token duas vezes.
async function findValidForUpdate(db, tokenHash) {
  const result = await db.query(
    `SELECT t.id, t.usuario_id, t.finalidade, u.nome, u.email, u.cargo, u.ativo
     FROM tokens_redefinicao_acesso t
     JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > now()
     FOR UPDATE OF t`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

module.exports = { invalidatePending, create, findValidForUpdate };
