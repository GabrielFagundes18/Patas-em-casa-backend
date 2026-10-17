/*
 * ============================================================================
 * ARQUIVO: fake-sessions.js (auxiliar de testes)
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Um "repositório de sessões" FALSO, que guarda as sessões na MEMÓRIA em vez
 *   do banco. Tem as mesmas funções do session-repository real, então os testes
 *   podem usá-lo no lugar dele (isso se chama "fake" ou "dublê de teste").
 *
 * PRINCIPAIS FUNÇÕES:
 *   - createFakeSessions(): cria o repositório falso (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Imita src/modules/auth/session-repository.js.
 *   - Usado por: tests/unit/auth-service.test.js, sessions-and-reset.test.js e outros.
 * ============================================================================
 */

// Gera ids únicos para as sessões.
const { randomUUID } = require('node:crypto');

/*
 * FUNÇÃO: createFakeSessions
 * Retorno: { rows (Map com as sessões, para os testes inspecionarem), create, findActive,
 *   touch, revoke, revokeAllForUser }.
 */
// Repositório de sessões em memória, com a mesma interface de src/modules/auth/session-repository.js.
function createFakeSessions() {
  // id → sessão.
  const rows = new Map();
  return {
    rows,
    // Cria a sessão e devolve o id.
    async create({ usuarioId, agenteUsuario, expiraEm }) {
      const id = randomUUID();
      rows.set(id, { id, usuario_id: usuarioId, agente_usuario: agenteUsuario, expira_em: expiraEm, revogado_em: null });
      return id;
    },
    // Ativa = existe, não revogada e ainda não expirou.
    async findActive(id) {
      const row = rows.get(id);
      return row && !row.revogado_em && row.expira_em > new Date() ? { id: row.id, usuario_id: row.usuario_id } : null;
    },
    // Não precisa fazer nada nos testes.
    async touch() {},
    // Revoga uma sessão.
    async revoke(id) {
      const row = rows.get(id);
      if (row && !row.revogado_em) row.revogado_em = new Date();
    },
    // Revoga todas as sessões do usuário, menos a exceção.
    async revokeAllForUser(usuarioId, { exceptId = null } = {}) {
      for (const row of rows.values()) {
        if (row.usuario_id === usuarioId && row.id !== exceptId && !row.revogado_em) row.revogado_em = new Date();
      }
    },
  };
}

// Exporta a fábrica.
module.exports = { createFakeSessions };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O teste cria um fake com createFakeSessions() e o passa ao createAuthService
 *   (injeção de dependência). Depois, consulta "rows" para conferir as sessões.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Dublês de teste (fake, stub, mock) e injeção de dependência.
 *   - Map e iteração com for...of em rows.values().
 * ============================================================================
 */
