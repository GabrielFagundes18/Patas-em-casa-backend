const triageService = require('../services/adoptions/adoption-triage-service');
const { auditContext } = require('../services/audit/audit-service');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.list = async (req, res, next) => {
  try {
    const { items, total } = await triageService.list(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.board = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.board({ incluirReprovados: req.query.incluir_reprovados === 'true' })));
  } catch (error) {
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.getById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.reveal = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.reveal(req.params.id, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.update(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.approve = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.approve(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.reject = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.reject(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.schedule = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.schedule(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.markTermSigned = async (req, res, next) => {
  try {
    return res.json(successResponse(await triageService.markTermSigned(req.params.id, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};
