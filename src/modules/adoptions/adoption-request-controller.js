const triageService = require('./adoption-triage-service');
const { auditContext } = require('../audit/audit-service');
const { listResponse, successResponse } = require('../../utils/http-response');
const { parsePagination } = require('../../utils/pagination');

exports.list = async (req, res) => {
  const { items, total } = await triageService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.board = async (req, res) => {
  return res.json(successResponse(await triageService.board({ incluirReprovados: req.query.incluir_reprovados === 'true' })));
};

exports.getById = async (req, res) => {
  return res.json(successResponse(await triageService.getById(req.params.id)));
};

exports.reveal = async (req, res) => {
  return res.json(successResponse(await triageService.reveal(req.params.id, auditContext(req))));
};

exports.update = async (req, res) => {
  return res.json(successResponse(await triageService.update(req.params.id, req.body, auditContext(req))));
};

exports.approve = async (req, res) => {
  return res.json(successResponse(await triageService.approve(req.params.id, req.body, auditContext(req))));
};

exports.reject = async (req, res) => {
  return res.json(successResponse(await triageService.reject(req.params.id, req.body, auditContext(req))));
};

exports.schedule = async (req, res) => {
  return res.json(successResponse(await triageService.schedule(req.params.id, req.body, auditContext(req))));
};

exports.reschedule = async (req, res) => {
  return res.json(successResponse(await triageService.reschedule(req.params.id, req.params.appointmentId, req.body, auditContext(req))));
};

exports.cancelAppointment = async (req, res) => {
  return res.json(successResponse(await triageService.cancelAppointment(req.params.id, req.params.appointmentId, req.body, auditContext(req))));
};

exports.completeAppointment = async (req, res) => {
  return res.json(successResponse(await triageService.completeAppointment(req.params.id, req.params.appointmentId, auditContext(req))));
};

exports.markTermSigned = async (req, res) => {
  return res.json(successResponse(await triageService.markTermSigned(req.params.id, auditContext(req))));
};
