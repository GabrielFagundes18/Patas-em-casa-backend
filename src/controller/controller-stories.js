const storyService = require('../services/stories/story-service');
const { auditContext } = require('../services/audit/audit-service');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.list = async (req, res) => {
  const { items, total } = await storyService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.getById = async (req, res) => {
  return res.json(successResponse(await storyService.getById(req.params.id)));
};

exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await storyService.create(req.body, auditContext(req))));
};

exports.update = async (req, res) => {
  return res.json(successResponse(await storyService.update(req.params.id, req.body, auditContext(req))));
};

exports.remove = async (req, res) => {
  await storyService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};
