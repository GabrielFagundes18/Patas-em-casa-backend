const volunteerService = require('../services/volunteers/volunteer-service');
const { auditContext } = require('../modules/audit/audit-service');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.list = async (req, res) => {
  const { items, total } = await volunteerService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.getById = async (req, res) => {
  return res.json(successResponse(await volunteerService.getById(req.params.id)));
};

exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await volunteerService.create(req.body, auditContext(req))));
};

exports.update = async (req, res) => {
  return res.json(successResponse(await volunteerService.update(req.params.id, req.body, auditContext(req))));
};

exports.remove = async (req, res) => {
  await volunteerService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};
