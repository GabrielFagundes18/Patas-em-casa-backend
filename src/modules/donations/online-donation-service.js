/*
 * ============================================================================
 * ARQUIVO: online-donation-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE das DOAÇÕES ONLINE pelo MERCADO PAGO:
 *     - startCheckout: cria a doação (única) ou a assinatura (mensal) e gera o
 *       link de pagamento do Mercado Pago;
 *     - getPublicStatus: situação da doação para a página de retorno do site;
 *     - handleWebhook: recebe os avisos do Mercado Pago, confere a assinatura,
 *       evita repetições e consulta a API do Mercado Pago para saber o estado real;
 *     - cancelamento da doação mensal: link por e-mail (token) ou pelo painel.
 *   Os dados de cartão nunca passam pela API da ONG: o pagamento acontece nas
 *   telas do próprio Mercado Pago.
 *
 * PRINCIPAIS ITENS:
 *   - CANCEL_LINK_DAYS, PAYMENT_STATUS (exportado), SUBSCRIPTION_STATUS.
 *   - paymentMethod(payment) (exportada), hashToken, unavailable (internas).
 *   - createOnlineDonationService(deps) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto, utils/app-error, config/env, utils/logger, utils/pagination, utils/validators.
 *   - ./online-donation-repository, ../audit/audit-service.
 *   - integrations: email/mailer, email/donation-emails, payments/mercado-pago-client.
 *   - Usado por: ./online-donation-controller.js. Testado em tests/unit/online-donations.test.js.
 * ============================================================================
 */

// Hash e bytes aleatórios (tokens de cancelamento).
const { createHash, randomBytes } = require('node:crypto');
// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Configuração (Mercado Pago, URLs do site e da API).
const { readConfig } = require('../../config/env');
// Logs.
const logger = require('../../utils/logger');
// Banco.
const repositoryModule = require('./online-donation-repository');
// Auditoria.
const auditService = require('../audit/audit-service');
// E-mails.
const defaultMailer = require('../../integrations/email/mailer');
const { buildCancelLinkEmail, buildSubscriptionActiveEmail } = require('../../integrations/email/donation-emails');
// Cliente do Mercado Pago e verificação de assinatura dos webhooks.
const { createMercadoPagoClient, verifyWebhookSignature } = require('../../integrations/payments/mercado-pago-client');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Padrão de UUID.
const { UUID_PATTERN } = require('../../utils/validators');

// Validade do link de cancelamento (dias).
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

/*
 * FUNÇÃO: paymentMethod (exportada)
 * O que faz: traduz o tipo de pagamento do Mercado Pago na forma de pagamento da doação.
 * Retorno: 'pix', 'cartao', 'boleto' ou null.
 */
// Tipo de pagamento → método da doação (saldo em conta do Mercado Pago fica sem método).
function paymentMethod(payment) {
  if (payment.payment_method_id === 'pix' || payment.payment_type_id === 'bank_transfer') return 'pix';
  if (['credit_card', 'debit_card', 'prepaid_card'].includes(payment.payment_type_id)) return 'cartao';
  if (payment.payment_type_id === 'ticket') return 'boleto';
  return null;
}

// Status da assinatura (preapproval) → status local.
const SUBSCRIPTION_STATUS = { authorized: 'ativa', paused: 'pausada', cancelled: 'cancelada', pending: 'pendente' };

// Hash SHA-256 do token (só o hash fica no banco).
function hashToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

// Erro 503 (serviço indisponível): Mercado Pago não configurado.
function unavailable() {
  return new AppError(503, 'PAGAMENTO_INDISPONIVEL', 'A doação online está temporariamente indisponível. Use a chave Pix da página.');
}

/*
 * FUNÇÃO: createOnlineDonationService (fábrica)
 * Parâmetros (objeto, opcionais): repository, config, gateway (cliente do Mercado Pago — null se
 *   não configurado), mailer, audit, log.
 * Retorno: { isAvailable, startCheckout, getPublicStatus, handleWebhook, requestCancelLink,
 *   cancelByToken, listSubscriptions, cancelSubscriptionById }.
 */
function createOnlineDonationService({
  repository = repositoryModule,
  config = readConfig(),
  gateway = config.mercadoPago ? createMercadoPagoClient({ accessToken: config.mercadoPago.accessToken }) : null,
  mailer = defaultMailer,
  audit = auditService,
  log = logger,
} = {}) {
  // Credenciais de teste do Mercado Pago começam com "TEST-" (ambiente "sandbox", sem dinheiro real).
  const sandbox = String(config.mercadoPago?.accessToken || '').startsWith('TEST-');
  // Link de pagamento: o de sandbox (se estiver em teste e existir) ou o de produção.
  const checkoutUrl = (result) => (sandbox && result.sandbox_init_point) || result.init_point;

  // Exige o Mercado Pago configurado (senão, 503).
  function requireGateway() {
    if (!gateway) throw unavailable();
    return gateway;
  }

  /*
   * startCheckout (async): inicia a doação.
   * Parâmetros: { valor, nome, email, tipo ('unica' | 'recorrente') }.
   * Retorno: { tipo, referencia (nosso id), checkout_url (para onde o site redireciona) }.
   */
  // Doação pelo site: única (Checkout Pro com Pix, cartão ou boleto) ou mensal (assinatura). O doador paga
  // nas telas do Mercado Pago, então dados de cartão nunca passam pela API da ONG.
  async function startCheckout({ valor, nome, email, tipo }) {
    const mp = requireGateway();
    // Valor arredondado para 2 casas.
    const amount = Math.round(Number(valor) * 100) / 100;
    const donor = { nome: nome.trim(), email: email.trim().toLowerCase(), valor: amount };

    // --- Doação mensal: cria a assinatura local e a "preapproval" no Mercado Pago ---
    if (tipo === 'recorrente') {
      const subscription = await repository.createSubscription(donor);
      const preapproval = await mp.createPreapproval({
        reason: 'Doação mensal para a Patas em Casa',
        // external_reference liga o registro do Mercado Pago ao nosso id.
        external_reference: subscription.id,
        payer_email: donor.email,
        // Cobrança automática: a cada 1 mês, no valor escolhido, em reais.
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'BRL' },
        // Para onde o Mercado Pago devolve a pessoa depois.
        back_url: `${config.frontendUrl}/doar/retorno?assinatura=${subscription.id}`,
        status: 'pending',
      });
      // Guarda o id da assinatura no Mercado Pago.
      await repository.updateSubscription(subscription.id, { gateway_assinatura_id: String(preapproval.id) });
      return { tipo: 'recorrente', referencia: subscription.id, checkout_url: checkoutUrl(preapproval) };
    }

    // --- Doação única: cria a doação pendente e a "preferência" (Checkout Pro) ---
    const donation = await repository.createPendingDonation(donor);
    const returnUrl = `${config.frontendUrl}/doar/retorno?ref=${donation.id}`;
    const preference = await mp.createPreference({
      items: [{ id: 'doacao', title: 'Doação para a Patas em Casa', quantity: 1, unit_price: amount, currency_id: 'BRL' }],
      payer: { name: donor.nome, email: donor.email },
      external_reference: donation.id,
      // Mesma página de retorno para sucesso, pendente e falha (ela consulta o status).
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      auto_return: 'approved',
      // Endereço do nosso webhook.
      notification_url: `${config.apiPublicUrl}/api/v1/webhooks/mercadopago`,
      // Texto que aparece na fatura do cartão.
      statement_descriptor: 'PATASEMCASA',
    });
    return { tipo: 'unica', referencia: donation.id, checkout_url: checkoutUrl(preference) };
  }

  /*
   * getPublicStatus (async): procura a referência como doação e, se não achar, como assinatura.
   * Retorno: { tipo, status, valor }. 404 se não existir (ou se a referência não for UUID).
   */
  // Situação para a página de retorno: só status, tipo e valor (nenhum dado pessoal).
  async function getPublicStatus(reference) {
    if (!UUID_PATTERN.test(String(reference))) throw new AppError(404, 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada.');
    const donation = await repository.findDonation(reference);
    if (donation) return { tipo: donation.tipo, status: donation.status, valor: Number(donation.valor) };
    const subscription = await repository.findSubscription(reference);
    if (subscription) return { tipo: 'recorrente', status: subscription.status, valor: Number(subscription.valor) };
    throw new AppError(404, 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada.');
  }

  /*
   * issueCancelLink (async): gera um token novo, grava o hash e a validade (7 dias) e devolve a URL.
   */
  async function issueCancelLink(subscription) {
    const token = randomBytes(32).toString('base64url');
    await repository.updateSubscription(subscription.id, {
      token_cancelamento_hash: hashToken(token),
      // Agora + 7 dias em milissegundos (dias × 24 h × 3600 s × 1000 ms).
      token_cancelamento_expira_em: new Date(Date.now() + CANCEL_LINK_DAYS * 24 * 3600 * 1000),
    });
    return `${config.frontendUrl}/doar/cancelar?token=${encodeURIComponent(token)}`;
  }

  /*
   * sendEmail (async): envia se o SMTP estiver configurado; falhas só vão para o log (não interrompem).
   */
  async function sendEmail(to, message, event) {
    if (!mailer.isConfigured()) return;
    try {
      await mailer.send({ to, ...message });
    } catch (error) {
      log.error(event, { module: 'donations', code: error.code });
    }
  }

  /*
   * syncPayment (async): webhook do tipo "payment".
   * Consulta o pagamento no Mercado Pago e atualiza a doação correspondente;
   * se for cobrança de assinatura, grava/atualiza a cobrança mensal.
   * Retorno: 'processado' ou 'ignorado'.
   */
  async function syncPayment(paymentId) {
    const payment = await requireGateway().getPayment(paymentId);
    // Status desconhecido → 'pendente'.
    const status = PAYMENT_STATUS[payment.status] || 'pendente';
    const changes = { status, metodo: paymentMethod(payment), gateway_pagamento_id: String(payment.id), gateway_status: payment.status };

    // Doação única: acha pela nossa referência (UUID) ou pelo id do pagamento.
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

  /*
   * syncSubscription (async): webhook do tipo "subscription_preapproval".
   * Atualiza o status da assinatura; na ATIVAÇÃO, envia o e-mail com o link de cancelamento.
   */
  async function syncSubscription(preapprovalId) {
    const preapproval = await requireGateway().getPreapproval(preapprovalId);
    // Acha pelo id do Mercado Pago ou, em último caso, pela nossa referência.
    const subscription = await repository.findSubscriptionByGatewayId(preapproval.id)
      || (UUID_PATTERN.test(String(preapproval.external_reference)) ? await repository.findSubscription(preapproval.external_reference) : null);
    if (!subscription) return 'ignorado';

    const previous = subscription.status;
    // Status desconhecido mantém o atual.
    const status = SUBSCRIPTION_STATUS[preapproval.status] || previous;
    // Nada mudou: nada a fazer.
    if (status === previous) return 'processado';
    await repository.updateSubscription(subscription.id, {
      status,
      gateway_assinatura_id: String(preapproval.id),
      // Data de cancelamento só quando cancelada (spread condicional).
      ...(status === 'cancelada' ? { cancelada_em: new Date() } : {}),
    });
    // Na ativação, o doador recebe o link para cancelar quando quiser.
    if (status === 'ativa' && previous === 'pendente') {
      const cancelUrl = await issueCancelLink(subscription);
      await sendEmail(subscription.doador_email, buildSubscriptionActiveEmail({ nome: subscription.doador_nome, valor: Number(subscription.valor), cancelUrl }), 'email_assinatura_falhou');
    }
    return 'processado';
  }

  /*
   * syncAuthorizedPayment (async): webhook do tipo "subscription_authorized_payment"
   * (uma cobrança mensal da assinatura). Grava/atualiza a cobrança.
   */
  async function syncAuthorizedPayment(authorizedPaymentId) {
    const charge = await requireGateway().getAuthorizedPayment(authorizedPaymentId);
    const subscription = await repository.findSubscriptionByGatewayId(charge.preapproval_id);
    // Sem assinatura conhecida ou sem pagamento associado: ignora.
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

  // Tabela "tipo de aviso → função que trata" (evita uma sequência de if/else).
  const HANDLERS = {
    payment: syncPayment,
    subscription_preapproval: syncSubscription,
    subscription_authorized_payment: syncAuthorizedPayment,
  };

  /*
   * handleWebhook (async): processa um aviso do Mercado Pago.
   * Parâmetros: { headers, query, body } da requisição.
   * Retorno: { status: 'processado' | 'ignorado' | 'duplicado' }.
   * Erros: 503 (sem configuração), 401 (assinatura inválida); erros de processamento são relançados
   *   (resposta 500) para o Mercado Pago tentar de novo mais tarde.
   */
  // Webhook do Mercado Pago: confere a assinatura, registra a notificação (idempotência) e consulta o estado
  // atual do recurso na API do Mercado Pago — o corpo da notificação nunca é usado como fonte da verdade.
  // Erro no processamento devolve 500 para o Mercado Pago tentar de novo.
  async function handleWebhook({ headers, query, body }) {
    if (!config.mercadoPago) throw unavailable();
    // O Mercado Pago pode mandar tipo e id no corpo ou na URL (formatos diferentes de notificação).
    // query['data.id'] usa colchetes porque o nome do parâmetro tem um ponto.
    const type = body?.type || query.type || query.topic;
    const dataId = query['data.id'] || body?.data?.id || query.id;
    const requestId = headers['x-request-id'];

    // Assinatura HMAC conferida antes de qualquer outra coisa.
    if (!verifyWebhookSignature({ signatureHeader: headers['x-signature'], requestId, dataId, secret: config.mercadoPago.webhookSecret })) {
      throw new AppError(401, 'ASSINATURA_INVALIDA', 'Notificação com assinatura inválida.');
    }
    // Tipo que não tratamos (ou sem id): responde ok e ignora.
    if (!dataId || !HANDLERS[type]) return { status: 'ignorado' };

    // Registra o evento; se já existia, é repetido.
    const eventId = await repository.registerWebhookEvent({
      eventoId: String(body?.id || requestId || `${type}:${dataId}:${body?.action || ''}`),
      tipo: type,
      recursoId: dataId,
    });
    if (!eventId) return { status: 'duplicado' };

    try {
      // Chama a função certa da tabela HANDLERS.
      const status = await HANDLERS[type](dataId);
      await repository.finishWebhookEvent(eventId, { status });
      return { status };
    } catch (error) {
      // Registra a falha (código com no máximo 80 caracteres) e relança.
      await repository.finishWebhookEvent(eventId, { status: 'falhou', codigoErro: String(error.code || 'ERRO').slice(0, 80) });
      throw error;
    }
  }

  /*
   * requestCancelLink (async): envia por e-mail um link de cancelamento para cada doação mensal
   * cancelável do e-mail. Não revela nada a quem pediu (o controller responde sempre igual).
   */
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

  /*
   * cancelSubscription (async, interna): cancela no Mercado Pago (se já existir lá) e no banco,
   * apagando o token de cancelamento. Se já estava cancelada, não faz nada.
   */
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

  /*
   * cancelByToken (async): cancelamento pelo link do e-mail.
   * Retorno: { status, valor }. 400 se o token for inválido ou expirado.
   */
  async function cancelByToken({ token }) {
    const subscription = await repository.findByCancelToken(hashToken(token));
    if (!subscription) {
      throw new AppError(400, 'LINK_INVALIDO', 'Este link é inválido ou já expirou. Peça um novo link na página de doação.');
    }
    const cancelled = await cancelSubscription(subscription);
    return { status: cancelled.status, valor: Number(cancelled.valor) };
  }

  /*
   * listSubscriptions (async): lista de assinaturas para o painel, com valores convertidos em número.
   */
  async function listSubscriptions(query = {}) {
    const { items, total } = await repository.listSubscriptions({ ...parsePagination(query), status: query.status });
    return {
      items: items.map((row) => ({ ...row, valor: Number(row.valor), total_arrecadado: Number(row.total_arrecadado) })),
      total,
    };
  }

  /*
   * cancelSubscriptionById (async): cancelamento pelo painel (com auditoria).
   */
  async function cancelSubscriptionById(id, actor = {}) {
    const subscription = await repository.findSubscription(id);
    if (!subscription) throw new AppError(404, 'ASSINATURA_NAO_ENCONTRADA', 'Doação mensal não encontrada.');
    const cancelled = await cancelSubscription(subscription);
    await audit.record({ actor, action: 'cancelar_assinatura', module: 'donations', entity: 'assinatura_doacao', entityId: id, before: { status: subscription.status }, after: { status: 'cancelada' } });
    return { ...cancelled, valor: Number(cancelled.valor) };
  }

  return {
    // O Mercado Pago está configurado?
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

// Exporta uma instância pronta, a fábrica e itens usados nos testes.
module.exports = { ...createOnlineDonationService(), createOnlineDonationService, PAYMENT_STATUS, paymentMethod };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. Site envia o formulário → startCheckout cria o registro local (pendente) e
 *      a cobrança no Mercado Pago → o site redireciona para checkout_url.
 *   2. O Mercado Pago avisa por webhook → handleWebhook confere a assinatura HMAC,
 *      registra o evento (ignora repetidos), consulta o estado real na API do
 *      Mercado Pago e atualiza doação/assinatura (HANDLERS por tipo).
 *   3. Assinatura ativada → e-mail com link de cancelamento (token com hash e validade).
 *   4. Cancelamento: pelo link (cancelByToken) ou pelo painel (cancelSubscriptionById),
 *      sempre cancelando também no Mercado Pago.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Integração com gateway de pagamento (checkout hospedado, sandbox, external_reference).
 *   - Webhooks: autenticidade (HMAC), idempotência e "não confiar no corpo do aviso".
 *   - Mapeamento de status de um sistema externo para o sistema local.
 *   - Tabela de despacho (objeto de funções) em vez de if/else.
 *   - Tokens de uso por link com hash e prazo de validade.
 * ============================================================================
 */
