/*
 * ============================================================================
 * ARQUIVO: online-donation-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER das DOAÇÕES ONLINE (Mercado Pago):
 *     - no site (sem login): iniciar o pagamento (checkout), consultar o
 *       andamento, pedir o link de cancelamento da doação mensal e cancelar
 *       usando o token do e-mail;
 *     - webhook: receber os avisos automáticos do Mercado Pago;
 *     - no painel: listar e cancelar assinaturas (doações mensais).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - checkout, status, requestCancelLink, cancelByToken, mercadoPagoWebhook,
 *     listSubscriptions, cancelSubscription.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./online-donation-service, ../audit/audit-service, utils/http-response, utils/pagination.
 *   - Usado por: modules/public/public-routes.js, ./webhook-routes.js e ./donation-routes.js.
 * ============================================================================
 */

// Regras das doações online.
const onlineDonationService = require('./online-donation-service');
// Autor da ação (painel).
const { auditContext } = require('../audit/audit-service');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

/*
 * checkout — POST /api/v1/public/donations/checkout
 * Cria a doação pendente e o pagamento no Mercado Pago; devolve o link de pagamento. Retorno: 201.
 */
exports.checkout = async (req, res) => {
  return res.status(201).json(successResponse(await onlineDonationService.startCheckout(req.body)));
};

/*
 * status — GET /api/v1/public/donations/status/:ref
 * Situação pública de uma doação (ex.: depois de voltar do Mercado Pago).
 */
exports.status = async (req, res) => {
  return res.json(successResponse(await onlineDonationService.getPublicStatus(req.params.ref)));
};

/*
 * requestCancelLink — POST /api/v1/public/donations/subscriptions/cancel-link
 * Resposta 202 sempre igual (não revela se existe doação com o e-mail).
 */
exports.requestCancelLink = async (req, res) => {
  await onlineDonationService.requestCancelLink(req.body);
  return res.status(202).json(successResponse({
    mensagem: 'Se houver doação mensal ativa com este e-mail, enviaremos o link de cancelamento.',
  }));
};

/*
 * cancelByToken — POST /api/v1/public/donations/subscriptions/cancel
 * Cancela a doação mensal com o token recebido por e-mail.
 */
exports.cancelByToken = async (req, res) => {
  return res.json(successResponse(await onlineDonationService.cancelByToken(req.body)));
};

/*
 * mercadoPagoWebhook — POST /api/v1/webhooks/mercadopago
 * Repassa cabeçalhos, query e corpo ao service, que confere a assinatura e processa o aviso.
 */
// O Mercado Pago só precisa de 200/201; o corpo é para diagnóstico.
exports.mercadoPagoWebhook = async (req, res) => {
  const result = await onlineDonationService.handleWebhook({ headers: req.headers, query: req.query, body: req.body });
  return res.status(200).json(successResponse(result));
};

/*
 * listSubscriptions — GET /api/v1/donations/subscriptions (painel)
 */
exports.listSubscriptions = async (req, res) => {
  const { items, total } = await onlineDonationService.listSubscriptions(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * cancelSubscription — POST /api/v1/donations/subscriptions/:id/cancel (painel, auditado)
 */
exports.cancelSubscription = async (req, res) => {
  return res.json(successResponse(await onlineDonationService.cancelSubscriptionById(req.params.id, auditContext(req))));
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Site → checkout → pessoa paga no Mercado Pago → Mercado Pago avisa por webhook
 *   → service confirma a doação. O site consulta o status; o doador pode cancelar
 *   a doação mensal pelo link do e-mail; o painel lista e cancela assinaturas.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Fluxo de pagamento com redirecionamento (checkout) e confirmação por webhook.
 *   - Status 201, 202 e 200.
 *   - Rotas públicas x rotas do painel usando o mesmo controller.
 * ============================================================================
 */
