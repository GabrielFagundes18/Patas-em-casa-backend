const storyService = require('../services/stories/story-service');
const { auditContext } = require('../services/audit/audit-service');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.list = async (req, res, next) => {
  try {
    const { items, total } = await storyService.list(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    return res.json(successResponse(await storyService.getById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    return res.status(201).json(successResponse(await storyService.create(req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    return res.json(successResponse(await storyService.update(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await storyService.remove(req.params.id, auditContext(req));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};
