const adopterService = require('../services/adopters/adopter-service');
const { auditContext } = require('../services/audit/audit-service');
const { hasPermission } = require('../config/permissions');
const { sendCsv, toCsv } = require('../utils/csv');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'nome', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'UF' },
  { key: 'status', label: 'Status' },
  { key: 'total_pedidos', label: 'Pedidos' },
  { key: 'pedidos_abertos', label: 'Pedidos em andamento' },
  { label: 'Cadastro', value: (row) => new Date(row.criado_em).toISOString().slice(0, 10) },
];

exports.list = async (req, res, next) => {
  try {
    const { items, total } = await adopterService.list(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const revealContacts = hasPermission(req.user.role, 'adopters:reveal');
    const rows = await adopterService.listForExport(req.query, { revealContacts }, auditContext(req));
    return sendCsv(res, `adotantes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
  } catch (error) {
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    return res.json(successResponse(await adopterService.getById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.reveal = async (req, res, next) => {
  try {
    return res.json(successResponse(await adopterService.reveal(req.params.id, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    return res.json(successResponse(await adopterService.update(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.exportTitularData = async (req, res, next) => {
  try {
    const data = await adopterService.exportTitularData(req.params.id, auditContext(req));
    res.setHeader('Content-Disposition', `attachment; filename="dados-titular-${req.params.id}.json"`);
    return res.json(successResponse(data));
  } catch (error) {
    return next(error);
  }
};

exports.anonymize = async (req, res, next) => {
  try {
    return res.json(successResponse(await adopterService.anonymize(req.params.id, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await adopterService.remove(req.params.id, auditContext(req));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};
