/*
 * ============================================================================
 * ARQUIVO: session-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY das SESSÕES do painel (tabela "sessoes"). Cada login cria uma
 *   sessão no banco; os tokens carregam o id dela. Assim, a sessão pode ser
 *   encerrada (revogada) a qualquer momento — no logout, na troca de senha ou ao
 *   desativar um usuário — e os tokens deixam de valer na hora.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - create, findActive, touch, revoke, revokeAllForUser.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/pool. Tabela "sessoes" (migration 010).
 *   - Usado por: ./auth-service.js, ../../middleware/auth.js e users/user-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');

/*
 * FUNÇÃO: create (async)
 * O que faz: cria uma sessão nova.
 * Parâmetros: { usuarioId, agenteUsuario (navegador, opcional), expiraEm (Date) }.
 * Retorno (string): o id (UUID) da sessão criada.
 */
// Sessões do painel (migration 010). O cookie de renovação carrega o id da sessão; revogar aqui
// derruba o acesso mesmo que o token ainda não tenha expirado.
async function create({ usuarioId, agenteUsuario, expiraEm }) {
  // "RETURNING id" faz o INSERT devolver o id gerado pelo banco.
  const result = await pool.query(
    'INSERT INTO sessoes (usuario_id, agente_usuario, expira_em) VALUES ($1, $2, $3) RETURNING id',
    [usuarioId, agenteUsuario || null, expiraEm]
  );
  return result.rows[0].id;
}

/*
 * FUNÇÃO: findActive (async)
 * O que faz: busca a sessão se ela não foi revogada e ainda não expirou.
 * Parâmetros: id (UUID).
 * Retorno: { id, usuario_id } ou null.
 */
async function findActive(id) {
  const result = await pool.query(
    'SELECT id, usuario_id FROM sessoes WHERE id = $1 AND revogado_em IS NULL AND expira_em > now()',
    [id]
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: touch (async)
 * O que faz: registra o último uso da sessão (a cada renovação).
 */
async function touch(id) {
  await pool.query('UPDATE sessoes SET ultimo_uso_em = now() WHERE id = $1', [id]);
}

/*
 * FUNÇÃO: revoke (async)
 * O que faz: encerra UMA sessão (logout). Só altera se ainda não estava revogada.
 */
async function revoke(id) {
  await pool.query('UPDATE sessoes SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL', [id]);
}

/*
 * FUNÇÃO: revokeAllForUser (async)
 * O que faz: encerra TODAS as sessões abertas do usuário, exceto (opcionalmente) uma.
 * Parâmetros:
 *   - usuarioId (UUID).
 *   - opções { exceptId (UUID | null): sessão a manter; db (padrão pool): conexão/transação }.
 * Detalhe do SQL: "$2::uuid IS NULL OR id <> $2::uuid" → se não houver exceção, revoga todas;
 *   se houver, revoga todas menos ela. "::uuid" converte o parâmetro para o tipo UUID.
 */
async function revokeAllForUser(usuarioId, { exceptId = null, db = pool } = {}) {
  await db.query(
    `UPDATE sessoes SET revogado_em = now()
     WHERE usuario_id = $1 AND revogado_em IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [usuarioId, exceptId]
  );
}

// Exporta as funções.
module.exports = { create, findActive, touch, revoke, revokeAllForUser };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   login → create; cada requisição/renovação → findActive (+ touch na renovação);
 *   logout → revoke; troca de senha/desativação → revokeAllForUser.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Sessões "com estado" no banco combinadas com JWT (revogação imediata).
 *   - INSERT ... RETURNING, UPDATE com condições e conversão de tipos (::uuid).
 *   - Parâmetros opcionais com valores padrão em objetos desestruturados.
 * ============================================================================
 */
