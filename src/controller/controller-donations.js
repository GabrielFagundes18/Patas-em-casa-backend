const donationService = require('../services/donations/donation-service');
const { auditContext } = require('../services/audit/audit-service');
const { formatDecimal, sendCsv, toCsv } = require('../utils/csv');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { label: 'Data', value: (row) => new Date(row.data).toISOString().slice(0, 10) },
  { key: 'doador_nome', label: 'Doador' },
  { key: 'doador_email', label: 'E-mail (mascarado)' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'metodo', label: 'Método' },
  { key: 'status', label: 'Status' },
  { label: 'Valor (R$)', value: (row) => formatDecimal(row.valor) },
];

exports.list = async (req, res, next) => {
  try {
    const { items, total } = await donationService.list(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.summary = async (req, res, next) => {
  try {
    return res.json(successResponse(await donationService.summary(req.query)));
  } catch (error) {
    return next(error);
  }
};

exports.monthly = async (req, res, next) => {
  try {
    return res.json(successResponse(await donationService.monthly(req.query)));
  } catch (error) {
    return next(error);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const rows = await donationService.listForExport(req.query, auditContext(req));
    return sendCsv(res, `doacoes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
  } catch (error) {
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    return res.json(successResponse(await donationService.getById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    return res.status(201).json(successResponse(await donationService.create(req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    return res.json(successResponse(await donationService.update(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};
