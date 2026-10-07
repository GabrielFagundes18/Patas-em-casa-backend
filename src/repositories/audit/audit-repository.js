const pool = require('../../db/pool');

const UNAVAILABLE_RECHECK_MS = 60000;
let tableAvailable = false;
let checkedAt = 0;

// A tabela vem da migração 001; enquanto ela não for aplicada, a disponibilidade é
// reconsultada a cada minuto, então aplicar a migração ativa a gravação sem reiniciar.
async function isAvailable(db = pool) {
  if (tableAvailable) return true;
  if (Date.now() - checkedAt < UNAVAILABLE_RECHECK_MS) return false;

  const result = await db.query("SELECT to_regclass('public.auditoria_eventos') IS NOT NULL AS available");
  tableAvailable = result.rows[0].available;
  checkedAt = Date.now();
  return tableAvailable;
}

async function insert(db = pool, event) {
  await db.query(
    `INSERT INTO auditoria_eventos
      (usuario_id, cargo, acao, modulo, entidade, entidade_id, ip, agente_usuario, valores_antes, valores_depois)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.userId,
      event.role,
      event.action,
      event.module,
      event.entity,
      event.entityId,
      event.ip,
      event.userAgent,
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
    ]
  );
}

module.exports = { isAvailable, insert };
