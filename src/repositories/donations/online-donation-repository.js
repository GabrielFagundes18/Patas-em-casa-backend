const pool = require('../../db/db');
const { buildUpdate } = require('../../db/sql');

// Doações online pelo Mercado Pago (migration 013): pagamentos únicos, assinaturas mensais e o registro
// de webhooks recebidos.
const GATEWAY = 'mercado_pago';
const SUBSCRIPTION_COLUMNS = `id, doador_nome, doador_email, valor, status, gateway, gateway_assinatura_id,
  criado_em, atualizado_em, cancelada_em`;

async function createPendingDonation({ nome, email, valor, tipo = 'unica', assinaturaId = null }, db = pool) {
  const result = await db.query(
    `INSERT INTO doacoes (doador_nome, doador_email, tipo, valor, status, gateway, assinatura_id)
     VALUES ($1, $2, $3, $4, 'pendente', $5, $6)
     RETURNING id, doador_nome, doador_email, tipo, valor, status, data`,
    [nome, email, tipo, valor, GATEWAY, assinaturaId]
  );
  return result.rows[0];
}

async function findDonation(id, db = pool) {
  const result = await db.query(
    'SELECT id, tipo, valor, status, metodo, gateway, gateway_pagamento_id, assinatura_id FROM doacoes WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function findDonationByPayment(paymentId, db = pool) {
  const result = await db.query(
    'SELECT id, tipo, valor, status, assinatura_id FROM doacoes WHERE gateway = $1 AND gateway_pagamento_id = $2',
    [GATEWAY, String(paymentId)]
  );
  return result.rows[0] || null;
}

async function updateDonation(id, changes, db = pool) {
  const update = buildUpdate(changes, new Set(['status', 'metodo', 'gateway_pagamento_id', 'gateway_status', 'valor']), id);
  if (update) await db.query(`UPDATE doacoes SET ${update.set} WHERE id = ${update.idParam}`, update.values);
}

// Cobrança mensal de uma assinatura: uma linha por pagamento do Mercado Pago (idempotente pelo id dele).
async function upsertSubscriptionPayment({ assinatura, paymentId, valor, status, metodo, gatewayStatus }, db = pool) {
  const result = await db.query(
    `INSERT INTO doacoes (doador_nome, doador_email, tipo, valor, metodo, status, gateway, gateway_pagamento_id, gateway_status, assinatura_id)
     VALUES ($1, $2, 'recorrente', $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (gateway, gateway_pagamento_id) WHERE gateway_pagamento_id IS NOT NULL
     DO UPDATE SET status = EXCLUDED.status, metodo = COALESCE(EXCLUDED.metodo, doacoes.metodo),
                   gateway_status = EXCLUDED.gateway_status, valor = EXCLUDED.valor
     RETURNING id`,
    [assinatura.doador_nome, assinatura.doador_email, valor, metodo, status, GATEWAY, String(paymentId), gatewayStatus, assinatura.id]
  );
  return result.rows[0].id;
}

async function createSubscription({ nome, email, valor }, db = pool) {
  const result = await db.query(
    `INSERT INTO assinaturas_doacao (doador_nome, doador_email, valor, gateway)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SUBSCRIPTION_COLUMNS}`,
    [nome, email, valor, GATEWAY]
  );
  return result.rows[0];
}

async function findSubscription(id, db = pool) {
  const result = await db.query(`SELECT ${SUBSCRIPTION_COLUMNS} FROM assinaturas_doacao WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function findSubscriptionByGatewayId(gatewayId, db = pool) {
  const result = await db.query(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM assinaturas_doacao WHERE gateway = $1 AND gateway_assinatura_id = $2`,
    [GATEWAY, String(gatewayId)]
  );
  return result.rows[0] || null;
}

async function updateSubscription(id, changes, db = pool) {
  const update = buildUpdate(
    changes,
    new Set(['status', 'gateway_assinatura_id', 'cancelada_em', 'token_cancelamento_hash', 'token_cancelamento_expira_em']),
    id
  );
  if (update) await db.query(`UPDATE assinaturas_doacao SET ${update.set} WHERE id = ${update.idParam}`, update.values);
  return findSubscription(id, db);
}

async function findCancellableByEmail(email, db = pool) {
  const result = await db.query(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM assinaturas_doacao
     WHERE lower(doador_email) = lower($1) AND status IN ('ativa', 'pausada', 'pendente')`,
    [email]
  );
  return result.rows;
}

async function findByCancelToken(tokenHash, db = pool) {
  const result = await db.query(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM assinaturas_doacao
     WHERE token_cancelamento_hash = $1 AND token_cancelamento_expira_em > now()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function listSubscriptions({ status, page, pageSize, offset }, db = pool) {
  const values = status ? [status] : [];
  const clause = status ? 'WHERE s.status = $1' : '';
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM assinaturas_doacao s ${clause}`, values);
  const result = await db.query(
    `SELECT s.id, s.doador_nome, s.doador_email, s.valor, s.status, s.criado_em, s.cancelada_em,
            COUNT(d.id) FILTER (WHERE d.status = 'confirmada')::int AS pagamentos_confirmados,
            COALESCE(SUM(d.valor) FILTER (WHERE d.status = 'confirmada'), 0) AS total_arrecadado
     FROM assinaturas_doacao s
     LEFT JOIN doacoes d ON d.assinatura_id = s.id
     ${clause}
     GROUP BY s.id
     ORDER BY s.criado_em DESC, s.id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );
  return { items: result.rows, total: count.rows[0].total };
}

// Idempotência: devolve null quando a mesma notificação já foi registrada.
async function registerWebhookEvent({ eventoId, tipo, recursoId }, db = pool) {
  const result = await db.query(
    `INSERT INTO gateway_webhook_eventos (provedor, evento_externo_id, tipo, recurso_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provedor, evento_externo_id) DO NOTHING
     RETURNING id`,
    [GATEWAY, eventoId, tipo, String(recursoId)]
  );
  return result.rows[0]?.id || null;
}

async function finishWebhookEvent(id, { status, codigoErro = null }, db = pool) {
  await db.query(
    'UPDATE gateway_webhook_eventos SET status = $2, codigo_erro = $3, processado_em = now() WHERE id = $1',
    [id, status, codigoErro]
  );
}

module.exports = {
  GATEWAY,
  createPendingDonation,
  findDonation,
  findDonationByPayment,
  updateDonation,
  upsertSubscriptionPayment,
  createSubscription,
  findSubscription,
  findSubscriptionByGatewayId,
  updateSubscription,
  findCancellableByEmail,
  findByCancelToken,
  listSubscriptions,
  registerWebhookEvent,
  finishWebhookEvent,
};
