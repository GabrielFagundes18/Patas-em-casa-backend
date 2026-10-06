const userService = require('../services/users/user-service');
const { auditContext } = require('../services/audit/audit-service');
const { getPermissionMatrix } = require('../config/permissions');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

exports.list = async (req, res, next) => {
  try {
    const { items, total } = await userService.list(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    return res.json(successResponse(await userService.getById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    return res.status(201).json(successResponse(await userService.create(req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    return res.json(successResponse(await userService.update(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await userService.resetPassword(req.params.id, req.body, auditContext(req));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};

exports.permissionMatrix = (req, res) => res.json(successResponse(getPermissionMatrix()));
