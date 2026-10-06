const logger = require('../../utils/logger');
const auditRepository = require('../../repositories/audit/audit-repository');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Extrai de req o contexto do autor da ação (usuário, cargo, IP e navegador).
function auditContext(req) {
  return {
    userId: req.user?.sub || null,
    role: req.user?.role || null,
    name: req.user?.nome || null,
    ip: req.ip || null,
    userAgent: req.get?.('user-agent')?.slice(0, 500) || null,
  };
}

function createAuditService({ repository = auditRepository, log = logger } = {}) {
  // Registra um evento sensível. Recebe o cliente da transação (db) quando a ação é transacional,
  // para que ação e auditoria sejam gravadas juntas ou desfeitas juntas.
  async function record(event, db) {
    const entry = {
      userId: UUID_PATTERN.test(String(event.actor?.userId)) ? event.actor.userId : null,
      role: event.actor?.role || null,
      ip: event.actor?.ip || null,
      userAgent: event.actor?.userAgent || null,
      action: event.action,
      module: event.module,
      entity: event.entity || null,
      entityId: UUID_PATTERN.test(String(event.entityId)) ? event.entityId : null,
      before: event.before,
      after: event.after,
    };

    if (await repository.isAvailable(db)) {
      await repository.insert(db, entry);
      return;
    }

    log.info('audit_event', {
      userId: entry.userId || undefined,
      action: entry.action,
      module: entry.module,
      entity: entry.entity || undefined,
      entityId: entry.entityId || undefined,
    });
  }

  return { record };
}

module.exports = { ...createAuditService(), createAuditService, auditContext };
