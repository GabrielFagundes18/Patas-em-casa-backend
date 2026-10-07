const userService = require('./user-service');
const { auditContext } = require('../audit/audit-service');
const { getPermissionMatrix } = require('../../config/permissions');
const { listResponse, successResponse } = require('../../utils/http-response');
const { parsePagination } = require('../../utils/pagination');

exports.list = async (req, res) => {
  const { items, total } = await userService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.getById = async (req, res) => {
  return res.json(successResponse(await userService.getById(req.params.id)));
};

exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await userService.create(req.body, auditContext(req))));
};

exports.update = async (req, res) => {
  return res.json(successResponse(await userService.update(req.params.id, req.body, auditContext(req))));
};

exports.resetPassword = async (req, res) => {
  await userService.resetPassword(req.params.id, req.body, auditContext(req));
  return res.status(204).end();
};

exports.sendInvite = async (req, res) => {
  return res.json(successResponse(await userService.sendInvite(req.params.id, auditContext(req))));
};

exports.permissionMatrix = (req, res) => res.json(successResponse(getPermissionMatrix()));
