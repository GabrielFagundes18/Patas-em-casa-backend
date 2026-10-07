const { createHash, randomBytes } = require('node:crypto');
const AppError = require('../../utils/app-error');
const { readConfig } = require('../../config/env');
const logger = require('../../utils/logger');
const repositoryModule = require('./online-donation-repository');
const auditService = require('../audit/audit-service');
const defaultMailer = require('../../integrations/email/mailer');
const { buildCancelLinkEmail, buildSubscriptionActiveEmail } = require('../../integrations/email/donation-emails');
const { createMercadoPagoClient, verifyWebhookSignature } = require('../../integrations/payments/mercado-pago-client');
const { parsePagination } = require('../../utils/pagination');
const { UUID_PATTERN } = require('../../utils/validators');

const CANCEL_LINK_DAYS = 7;

// Status do pagamento no Mercado Pago → status da doação.
const PAYMENT_STATUS = {
  approved: 'confirmada',
  authorized: 'confirmada',
  pending: 'pendente',
  in_process: 'pendente',
  in_mediation: 'pendente',
  rejected: 'falhou',
  cancelled: 'cancelada',
  refunded: 'cancelada',
  charged_back: 'cancelada',
};

// Tipo de pagamento → método da doação (saldo em conta do Mercado Pago fica sem método).
function paymentMethod(payment) {
  if (payment.payment_method_id === 'pix' || payment.payment_type_id === 'bank_transfer') return 'pix';
  if (['credit_card', 'debit_card', 'prepaid_card'].includes(payment.payment_type_id)) return 'cartao';
  if (payment.payment_type_id === 'ticket') return 'boleto';
  return null;
}

// Status da assinatura (preapproval) → status local.
const SUBSCRIPTION_STATUS = { authorized: 'ativa', paused: 'pausada', cancelled: 'cancelada', pending: 'pendente' };

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

function unavailable() {
  return new AppError(503, 'PAGAMENTO_INDISPONIVEL', 'A doação online está temporariamente indisponível. Use a chave Pix da página.');
}

function createOnlineDonationService({
  repository = repositoryModule,
  config = readConfig(),
  gateway = config.mercadoPago ? createMercadoPagoClient({ accessToken: config.mercadoPago.accessToken }) : null,
  mailer = defaultMailer,
  audit = auditService,
  log = logger,
} = {}) {
  const sandbox = String(config.mercadoPago?.accessToken || '').startsWith('TEST-');
  const checkoutUrl = (result) => (sandbox && result.sandbox_init_point) || result.init_point;

  function requireGateway() {
    if (!gateway) throw unavailable();
    return gateway;
  }

  // Doação pelo site: única (Checkout Pro com Pix, cartão ou boleto) ou mensal (assinatura). O doador paga
  // nas telas do Mercado Pago, então dados de cartão nunca passam pela API da ONG.
  async function startCheckout({ valor, nome, email, tipo }) {
    const mp = requireGateway();
    const amount = Math.round(Number(valor) * 100) / 100;
    const donor = { nome: nome.trim(), email: email.trim().toLowerCase(), valor: amount };

    if (tipo === 'recorrente') {
      const subscription = await repository.createSubscription(donor);
      const preapproval = await mp.createPreapproval({
        reason: 'Doação mensal para a Patas em Casa',
        external_reference: subscription.id,
        payer_email: donor.email,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'BRL' },
        back_url: `${config.frontendUrl}/doar/retorno?assinatura=${subscription.id}`,
        status: 'pending',
      });
      await repository.updateSubscription(subscription.id, { gateway_assinatura_id: String(preapproval.id) });
      return { tipo: 'recorrente', referencia: subscription.id, checkout_url: checkoutUrl(preapproval) };
    }

    const donation = await repository.createPendingDonation(donor);
    const returnUrl = `${config.frontendUrl}/doar/retorno?ref=${donation.id}`;
    const preference = await mp.createPreference({
      items: [{ id: 'doacao', title: 'Doação para a Patas em Casa', quantity: 1, unit_price: amount, currency_id: 'BRL' }],
      payer: { name: donor.nome, email: donor.email },
      external_reference: donation.id,
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      auto_return: 'approved',
      notification_url: `${config.apiPublicUrl}/api/v1/webhooks/mercadopago`,
      statement_descriptor: 'PATASEMCASA',
    });
    return { tipo: 'unica', referencia: donation.id, checkout_url: checkoutUrl(preference) };
  }

  // Situação para a página de retorno: só status, tipo e valor (nenhum dado pessoal).
  async function getPublicStatus(reference) {
    if (!UUID_PATTERN.test(String(reference))) throw new AppError(404, 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada.');
    const donation = await repository.findDonation(reference);
    if (donation) return { tipo: donation.tipo, status: donation.status, valor: Number(donation.valor) };
    const subscription = await repository.findSubscription(reference);
    if (subscription) return { tipo: 'recorrente', status: subscription.status, valor: Number(subscription.valor) };
    throw new AppError(404, 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada.');
  }

  async function issueCancelLink(subscription) {
    const token = randomBytes(32).toString('base64url');
    await repository.updateSubscription(subscription.id, {
      token_cancelamento_hash: hashToken(token),
      token_cancelamento_expira_em: new Date(Date.now() + CANCEL_LINK_DAYS * 24 * 3600 * 1000),
    });
    return `${config.frontendUrl}/doar/cancelar?token=${encodeURIComponent(token)}`;
  }

  async function sendEmail(to, message, event) {
    if (!mailer.isConfigured()) return;
    try {
      await mailer.send({ to, ...message });
    } catch (error) {
      log.error(event, { module: 'donations', code: error.code });
    }
  }

  async function syncPayment(paymentId) {
    const payment = await requireGateway().getPayment(paymentId);
    const status = PAYMENT_STATUS[payment.status] || 'pendente';
    const changes = { status, metodo: paymentMethod(payment), gateway_pagamento_id: String(payment.id), gateway_status: payment.status };

    const donation = UUID_PATTERN.test(String(payment.external_reference))
      ? await repository.findDonation(payment.external_reference)
      : await repository.findDonationByPayment(payment.id);
    if (donation) {
      await repository.updateDonation(donation.id, changes);
      return 'processado';
    }

    // Cobrança de assinatura que chegou como "payment": a referência é a da assinatura.
    const subscription = UUID_PATTERN.test(String(payment.external_reference))
      ? await repository.findSubscription(payment.external_reference)
      : null;
    if (!subscription) return 'ignorado';
    await repository.upsertSubscriptionPayment({
      assinatura: subscription, paymentId: payment.id, valor: payment.transaction_amount ?? subscription.valor,
      status, metodo: changes.metodo, gatewayStatus: payment.status,
    });
    return 'processado';
  }

  async function syncSubscription(preapprovalId) {
    const preapproval = await requireGateway().getPreapproval(preapprovalId);
    const subscription = await repository.findSubscriptionByGatewayId(preapproval.id)
      || (UUID_PATTERN.test(String(preapproval.external_reference)) ? await repository.findSubscription(preapproval.external_reference) : null);
    if (!subscription) return 'ignorado';

    const previous = subscription.status;
    const status = SUBSCRIPTION_STATUS[preapproval.status] || previous;
    if (status === previous) return 'processado';
    await repository.updateSubscription(subscription.id, {
      status,
      gateway_assinatura_id: String(preapproval.id),
      ...(status === 'cancelada' ? { cancelada_em: new Date() } : {}),
    });
    // Na ativação, o doador recebe o link para cancelar quando quiser.
    if (status === 'ativa' && previous === 'pendente') {
      const cancelUrl = await issueCancelLink(subscription);
      await sendEmail(subscription.doador_email, buildSubscriptionActiveEmail({ nome: subscription.doador_nome, valor: Number(subscription.valor), cancelUrl }), 'email_assinatura_falhou');
    }
    return 'processado';
  }

  async function syncAuthorizedPayment(authorizedPaymentId) {
    const charge = await requireGateway().getAuthorizedPayment(authorizedPaymentId);
    const subscription = await repository.findSubscriptionByGatewayId(charge.preapproval_id);
    if (!subscription || !charge.payment?.id) return 'ignorado';
    await repository.upsertSubscriptionPayment({
      assinatura: subscription,
      paymentId: charge.payment.id,
      valor: charge.transaction_amount ?? subscription.valor,
      status: PAYMENT_STATUS[charge.payment.status] || 'pendente',
      metodo: null,
      gatewayStatus: charge.payment.status,
    });
    return 'processado';
  }

  const HANDLERS = {
    payment: syncPayment,
    subscription_preapproval: syncSubscription,
    subscription_authorized_payment: syncAuthorizedPayment,
  };

  // Webhook do Mercado Pago: confere a assinatura, registra a notificação (idempotência) e consulta o estado
  // atual do recurso na API do Mercado Pago — o corpo da notificação nunca é usado como fonte da verdade.
  // Erro no processamento devolve 500 para o Mercado Pago tentar de novo.
  async function handleWebhook({ headers, query, body }) {
    if (!config.mercadoPago) throw unavailable();
    const type = body?.type || query.type || query.topic;
    const dataId = query['data.id'] || body?.data?.id || query.id;
    const requestId = headers['x-request-id'];

    if (!verifyWebhookSignature({ signatureHeader: headers['x-signature'], requestId, dataId, secret: config.mercadoPago.webhookSecret })) {
      throw new AppError(401, 'ASSINATURA_INVALIDA', 'Notificação com assinatura inválida.');
    }
    if (!dataId || !HANDLERS[type]) return { status: 'ignorado' };

    const eventId = await repository.registerWebhookEvent({
      eventoId: String(body?.id || requestId || `${type}:${dataId}:${body?.action || ''}`),
      tipo: type,
      recursoId: dataId,
    });
    if (!eventId) return { status: 'duplicado' };

    try {
      const status = await HANDLERS[type](dataId);
      await repository.finishWebhookEvent(eventId, { status });
      return { status };
    } catch (error) {
      await repository.finishWebhookEvent(eventId, { status: 'falhou', codigoErro: String(error.code || 'ERRO').slice(0, 80) });
      throw error;
    }
  }

  // "Quero cancelar minha doação mensal": resposta sempre igual; o link vai por e-mail.
  async function requestCancelLink({ email }) {
    const subscriptions = await repository.findCancellableByEmail(email.trim());
    if (subscriptions.length === 0 || !mailer.isConfigured()) return;
    const links = [];
    for (const subscription of subscriptions) {
      links.push({ valor: Number(subscription.valor), url: await issueCancelLink(subscription) });
    }
    await sendEmail(subscriptions[0].doador_email, buildCancelLinkEmail({ nome: subscriptions[0].doador_nome, links }), 'email_link_cancelamento_falhou');
  }

  async function cancelSubscription(subscription) {
    if (subscription.status === 'cancelada') return subscription;
    if (subscription.gateway_assinatura_id) await requireGateway().cancelPreapproval(subscription.gateway_assinatura_id);
    return repository.updateSubscription(subscription.id, {
      status: 'cancelada',
      cancelada_em: new Date(),
      token_cancelamento_hash: null,
      token_cancelamento_expira_em: null,
    });
  }

  async function cancelByToken({ token }) {
    const subscription = await repository.findByCancelToken(hashToken(token));
    if (!subscription) {
      throw new AppError(400, 'LINK_INVALIDO', 'Este link é inválido ou já expirou. Peça um novo link na página de doação.');
    }
    const cancelled = await cancelSubscription(subscription);
    return { status: cancelled.status, valor: Number(cancelled.valor) };
  }

  async function listSubscriptions(query = {}) {
    const { items, total } = await repository.listSubscriptions({ ...parsePagination(query), status: query.status });
    return {
      items: items.map((row) => ({ ...row, valor: Number(row.valor), total_arrecadado: Number(row.total_arrecadado) })),
      total,
    };
  }

  async function cancelSubscriptionById(id, actor = {}) {
    const subscription = await repository.findSubscription(id);
    if (!subscription) throw new AppError(404, 'ASSINATURA_NAO_ENCONTRADA', 'Doação mensal não encontrada.');
    const cancelled = await cancelSubscription(subscription);
    await audit.record({ actor, action: 'cancelar_assinatura', module: 'donations', entity: 'assinatura_doacao', entityId: id, before: { status: subscription.status }, after: { status: 'cancelada' } });
    return { ...cancelled, valor: Number(cancelled.valor) };
  }

  return {
    isAvailable: () => Boolean(gateway),
    startCheckout,
    getPublicStatus,
    handleWebhook,
    requestCancelLink,
    cancelByToken,
    listSubscriptions,
    cancelSubscriptionById,
  };
}

module.exports = { ...createOnlineDonationService(), createOnlineDonationService, PAYMENT_STATUS, paymentMethod };
