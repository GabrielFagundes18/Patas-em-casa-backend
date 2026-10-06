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

exports.list = async (req, res) => {
  const { items, total } = await animalService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

exports.exportCsv = async (req, res) => {
  const rows = await animalService.listForExport(req.query);
  return sendCsv(res, `animais-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
};

exports.getById = async (req, res) => {
  return res.json(successResponse(await animalService.getDetail(req.params.id)));
};

exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await animalService.create(req.body, auditContext(req))));
};

exports.update = async (req, res) => {
  return res.json(successResponse(await animalService.update(req.params.id, req.body, auditContext(req))));
};

exports.updateStatus = async (req, res) => {
  const { status, motivo } = req.body;
  return res.json(successResponse(await animalService.changeStatus(req.params.id, { status, motivo }, auditContext(req))));
};

exports.remove = async (req, res) => {
  await animalService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};

exports.addPhotos = async (req, res) => {
  return res.status(201).json(successResponse(await animalService.addPhotos(req.params.id, req.files, auditContext(req))));
};

exports.setPrincipalPhoto = async (req, res) => {
  return res.json(successResponse(await animalService.setPrincipalPhoto(req.params.id, req.params.photoId, auditContext(req))));
};

exports.removePhoto = async (req, res) => {
  return res.json(successResponse(await animalService.removePhoto(req.params.id, req.params.photoId, auditContext(req))));
};
