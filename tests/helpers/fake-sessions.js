const { randomUUID } = require('node:crypto');

// Repositório de sessões em memória, com a mesma interface de src/modules/auth/session-repository.js.
function createFakeSessions() {
  const rows = new Map();
  return {
    rows,
    async create({ usuarioId, agenteUsuario, expiraEm }) {
      const id = randomUUID();
      rows.set(id, { id, usuario_id: usuarioId, agente_usuario: agenteUsuario, expira_em: expiraEm, revogado_em: null });
      return id;
    },
    async findActive(id) {
      const row = rows.get(id);
      return row && !row.revogado_em && row.expira_em > new Date() ? { id: row.id, usuario_id: row.usuario_id } : null;
    },
    async touch() {},
    async revoke(id) {
      const row = rows.get(id);
      if (row && !row.revogado_em) row.revogado_em = new Date();
    },
    async revokeAllForUser(usuarioId, { exceptId = null } = {}) {
      for (const row of rows.values()) {
        if (row.usuario_id === usuarioId && row.id !== exceptId && !row.revogado_em) row.revogado_em = new Date();
      }
    },
  };
}

module.exports = { createFakeSessions };
