const animalService = require('../services/animals/animal-service');
const { auditContext } = require('../services/audit/audit-service');
const { formatDecimal, sendCsv, toCsv } = require('../utils/csv');
const { listResponse, successResponse } = require('../utils/http-response');
const { parsePagination } = require('../utils/pagination');

const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'nome', label: 'Nome' },
  { key: 'especie', label: 'Espécie' },
  { key: 'raca', label: 'Raça' },
  { key: 'sexo', label: 'Sexo' },
  { label: 'Idade (anos)', value: (row) => formatDecimal(row.idade_anos) },
  { key: 'porte', label: 'Porte' },
  { key: 'status', label: 'Status' },
  { label: 'Castrado', value: (row) => (row.castrado ? 'sim' : 'não') },
  { label: 'Vacinado', value: (row) => (row.vacinado ? 'sim' : 'não') },
  { key: 'data_entrada', label: 'Data de entrada' },
];

exports.list = async (req, res, next) => {
  try {
    const { items, total } = await animalService.list(req.query);
    const { page, pageSize } = parsePagination(req.query);
    return res.json(listResponse(items, total, page, pageSize));
  } catch (error) {
    return next(error);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const rows = await animalService.listForExport(req.query);
    return sendCsv(res, `animais-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
  } catch (error) {
    return next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    return res.json(successResponse(await animalService.getById(req.params.id)));
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    return res.status(201).json(successResponse(await animalService.create(req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    return res.json(successResponse(await animalService.update(req.params.id, req.body, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status, motivo } = req.body;
    return res.json(successResponse(await animalService.changeStatus(req.params.id, { status, motivo }, auditContext(req))));
  } catch (error) {
    return next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await animalService.remove(req.params.id, auditContext(req));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};
