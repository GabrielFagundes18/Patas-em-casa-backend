const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');
const { verifyWebhookSignature } = require('../src/integrations/payments/mercado-pago-client');
const { createOnlineDonationService, paymentMethod } = require('../src/services/donations/online-donation-service');

const SECRET = 'segredo-do-webhook';
const config = {
  frontendUrl: 'https://patas.example',
  apiPublicUrl: 'https://api.patas.example',
  mercadoPago: { accessToken: 'TEST-123', webhookSecret: SECRET },
};

function signed(dataId, requestId = 'req-1', ts = '1742505638683') {
  const v1 = createHmac('sha256', SECRET).update(`id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

function setup() {
  const donations = new Map();
  const subscriptions = new Map();
  const events = new Set();
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const repository = {
    createPendingDonation: async ({ nome, email, valor }) => {
      const row = { id: uuid(), doador_nome: nome, doador_email: email, tipo: 'unica', valor, status: 'pendente' };
      donations.set(row.id, row);
      return row;
    },
    findDonation: async (id) => donations.get(id) || null,
    findDonationByPayment: async (paymentId) => [...donations.values()].find((d) => d.gateway_pagamento_id === String(paymentId)) || null,
    updateDonation: async (id, changes) => Object.assign(donations.get(id), changes),
    upsertSubscriptionPayment: async ({ assinatura, paymentId, valor, status }) => {
      const existing = [...donations.values()].find((d) => d.gateway_pagamento_id === String(paymentId));
      if (existing) return Object.assign(existing, { status, valor }).id;
      const row = { id: uuid(), tipo: 'recorrente', assinatura_id: assinatura.id, gateway_pagamento_id: String(paymentId), valor, status };
      donations.set(row.id, row);
      return row.id;
    },
    createSubscription: async ({ nome, email, valor }) => {
      const row = { id: uuid(), doador_nome: nome, doador_email: email, valor, status: 'pendente' };
      subscriptions.set(row.id, row);
      return row;
    },
    findSubscription: async (id) => subscriptions.get(id) || null,
    findSubscriptionByGatewayId: async (gatewayId) => [...subscriptions.values()].find((s) => s.gateway_assinatura_id === String(gatewayId)) || null,
    updateSubscription: async (id, changes) => Object.assign(subscriptions.get(id), changes),
    findCancellableByEmail: async (email) => [...subscriptions.values()].filter((s) => s.doador_email === email && s.status !== 'cancelada'),
    findByCancelToken: async (hash) => [...subscriptions.values()].find((s) => s.token_cancelamento_hash?.equals(hash) && s.token_cancelamento_expira_em > new Date()) || null,
    registerWebhookEvent: async ({ eventoId }) => (events.has(eventoId) ? null : (events.add(eventoId), eventoId)),
    finishWebhookEvent: async () => {},
  };
  const calls = [];
  const remote = { payments: new Map(), preapprovals: new Map(), charges: new Map() };
  const gateway = {
    createPreference: async (body) => (calls.push(['preference', body]), { id: 'pref-1', init_point: 'https://mp/checkout', sandbox_init_point: 'https://sandbox.mp/checkout' }),
    createPreapproval: async (body) => (calls.push(['preapproval', body]), { id: 'pre-1', init_point: 'https://mp/assinatura' }),
    getPayment: async (id) => remote.payments.get(id),
    getPreapproval: async (id) => remote.preapprovals.get(id),
    cancelPreapproval: async (id) => calls.push(['cancel', id]),
    getAuthorizedPayment: async (id) => remote.charges.get(id),
  };
  const sent = [];
  const service = createOnlineDonationService({
    repository,
    config,
    gateway,
    mailer: { isConfigured: () => true, send: async (message) => sent.push(message) },
    audit: { record: async () => {} },
    log: { error: () => {} },
  });
  return { service, donations, subscriptions, calls, remote, sent };
}

test('webhook signatures follow the Mercado Pago manifest and reject tampering', () => {
  const headers = signed('123456');
  assert.equal(verifyWebhookSignature({ signatureHeader: headers['x-signature'], requestId: 'req-1', dataId: '123456', secret: SECRET }), true);
  assert.equal(verifyWebhookSignature({ signatureHeader: headers['x-signature'], requestId: 'req-1', dataId: '999999', secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ signatureHeader: headers['x-signature'], requestId: 'req-2', dataId: '123456', secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ signatureHeader: 'ts=1,v1=abc', requestId: 'req-1', dataId: '123456', secret: SECRET }), false);
  assert.equal(verifyWebhookSignature({ signatureHeader: undefined, requestId: 'req-1', dataId: '1', secret: SECRET }), false);
});

test('payment types map to the donation methods', () => {
  assert.equal(paymentMethod({ payment_method_id: 'pix', payment_type_id: 'bank_transfer' }), 'pix');
  assert.equal(paymentMethod({ payment_type_id: 'credit_card' }), 'cartao');
  assert.equal(paymentMethod({ payment_type_id: 'ticket' }), 'boleto');
  assert.equal(paymentMethod({ payment_type_id: 'account_money' }), null);
});

test('a one-time donation creates a pending record and a Checkout Pro preference', async () => {
  const { service, donations, calls } = setup();

  const result = await service.startCheckout({ valor: 50, nome: ' Ana ', email: 'ANA@example.org', tipo: 'unica' });

  assert.equal(result.checkout_url, 'https://sandbox.mp/checkout');
  const donation = donations.get(result.referencia);
  assert.deepEqual([donation.status, donation.valor, donation.doador_email], ['pendente', 50, 'ana@example.org']);
  const [, body] = calls[0];
  assert.equal(body.external_reference, donation.id);
  assert.equal(body.items[0].unit_price, 50);
  assert.equal(body.back_urls.success, `https://patas.example/doar/retorno?ref=${donation.id}`);
  assert.equal(body.notification_url, 'https://api.patas.example/api/v1/webhooks/mercadopago');
});

test('forged webhooks are refused before anything is read or written', async () => {
  const { service, donations, remote } = setup();
  const { referencia } = await service.startCheckout({ valor: 30, nome: 'Bia', email: 'bia@example.org', tipo: 'unica' });
  remote.payments.set('777', { id: 777, status: 'approved', external_reference: referencia });

  await assert.rejects(
    service.handleWebhook({ headers: { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'req-1' }, query: { 'data.id': '777', type: 'payment' }, body: {} }),
    { status: 401, code: 'ASSINATURA_INVALIDA' }
  );
  assert.equal(donations.get(referencia).status, 'pendente');
});

test('payment, subscription and monthly charge notifications update the records', async () => {
  const { service, donations, subscriptions, remote, sent, calls } = setup();
  const once = await service.startCheckout({ valor: 30, nome: 'Bia', email: 'bia@example.org', tipo: 'unica' });
  remote.payments.set('777', { id: 777, status: 'approved', payment_method_id: 'pix', payment_type_id: 'bank_transfer', external_reference: once.referencia });

  const paid = await service.handleWebhook({ headers: signed('777'), query: { 'data.id': '777', type: 'payment' }, body: { id: 'n1', type: 'payment' } });
  assert.equal(paid.status, 'processado');
  assert.deepEqual([donations.get(once.referencia).status, donations.get(once.referencia).metodo], ['confirmada', 'pix']);
  const again = await service.handleWebhook({ headers: signed('777'), query: { 'data.id': '777', type: 'payment' }, body: { id: 'n1', type: 'payment' } });
  assert.equal(again.status, 'duplicado');

  remote.payments.set('778', { id: 778, status: 'rejected', payment_type_id: 'credit_card', external_reference: once.referencia });
  await service.handleWebhook({ headers: signed('778', 'req-2'), query: { 'data.id': '778', type: 'payment' }, body: { id: 'n2', type: 'payment' } });
  assert.equal(donations.get(once.referencia).status, 'falhou');

  const monthly = await service.startCheckout({ valor: 25, nome: 'Caio Dias', email: 'caio@example.org', tipo: 'recorrente' });
  assert.equal(monthly.checkout_url, 'https://mp/assinatura');
  assert.equal(calls.at(-1)[1].auto_recurring.transaction_amount, 25);
  remote.preapprovals.set('pre-1', { id: 'pre-1', status: 'authorized', external_reference: monthly.referencia });
  await service.handleWebhook({ headers: signed('pre-1', 'req-3'), query: { 'data.id': 'pre-1', type: 'subscription_preapproval' }, body: { id: 'n3' } });
  assert.equal(subscriptions.get(monthly.referencia).status, 'ativa');
  assert.match(sent[0].text, /https:\/\/patas\.example\/doar\/cancelar\?token=/);

  remote.charges.set('ap-1', { id: 'ap-1', preapproval_id: 'pre-1', transaction_amount: 25, payment: { id: 9001, status: 'approved' } });
  await service.handleWebhook({ headers: signed('ap-1', 'req-4'), query: { 'data.id': 'ap-1', type: 'subscription_authorized_payment' }, body: { id: 'n4' } });
  const charge = [...donations.values()].find((d) => d.assinatura_id === monthly.referencia);
  assert.deepEqual([charge.tipo, charge.status, charge.valor], ['recorrente', 'confirmada', 25]);
  assert.deepEqual(await service.getPublicStatus(monthly.referencia), { tipo: 'recorrente', status: 'ativa', valor: 25 });

  const token = new URL(sent[0].text.match(/https:\/\/patas\.example\/doar\/cancelar\S+/)[0]).searchParams.get('token');
  const cancelled = await service.cancelByToken({ token });
  assert.equal(cancelled.status, 'cancelada');
  assert.deepEqual(calls.at(-1), ['cancel', 'pre-1']);
  await assert.rejects(service.cancelByToken({ token }), { status: 400, code: 'LINK_INVALIDO' });
});

test('without Mercado Pago credentials the online donation answers 503', async () => {
  const service = createOnlineDonationService({ repository: {}, config: { ...config, mercadoPago: null }, gateway: null });
  assert.equal(service.isAvailable(), false);
  await assert.rejects(service.startCheckout({ valor: 10, nome: 'Ana', email: 'a@b.co', tipo: 'unica' }), { status: 503, code: 'PAGAMENTO_INDISPONIVEL' });
});
