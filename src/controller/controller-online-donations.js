const onlineDonationService = require('../services/donations/online-donation-service');
const { auditContext } = require('../modules/audit/audit-service');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.checkout = async (req, res) => {
  return res.status(201).json(successResponse(await onlineDonationService.startCheckout(req.body)));
};

exports.status = async (req, res) => {
  return res.json(successResponse(await onlineDonationService.getPublicStatus(req.params.ref)));
};

exports.requestCancelLink = async (req, res) => {
  await onlineDonationService.requestCancelLink(req.body);
  return res.status(202).json(successResponse({
    mensagem: 'Se houver doação mensal ativa com este e-mail, enviaremos o link de cancelamento.',
  }));
};

exports.cancelByToken = async (req, res) => {
  return res.json(successResponse(await onlineDonationService.cancelByToken(req.body)));
};

// O Mercado Pago só precisa de 200/201; o corpo é para diagnóstico.
exports.mercadoPagoWebhook = async (req, res) => {
  const result = await onlineDonationService.handleWebhook({ headers: req.headers, query: req.query, body: req.body });
  return res.status(200).json(successResponse(result));
};

exports.listSubscriptions = async (req, res) => {
  const { items, total } = await onlineDonationService.listSubscriptions(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.cancelSubscription = async (req, res) => {
  return res.json(successResponse(await onlineDonationService.cancelSubscriptionById(req.params.id, auditContext(req))));
};
