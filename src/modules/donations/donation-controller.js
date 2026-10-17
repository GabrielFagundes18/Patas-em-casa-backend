/*
 * ============================================================================
 * ARQUIVO: donation-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER das DOAÇÕES no painel: listar, resumo (totais por status,
 *   forma de pagamento e tipo), série mensal, exportar CSV, ver detalhes,
 *   registrar e editar doações.
 *
 * PRINCIPAIS ITENS:
 *   - EXPORT_COLUMNS (colunas do CSV).
 *   - list, summary, monthly, exportCsv, getById, create, update.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./donation-service, ../audit/audit-service, utils/csv, utils/http-response, utils/pagination.
 *   - Usado por: ./donation-routes.js.
 * ============================================================================
 */

// Regras das doações.
const donationService = require('./donation-service');
// Autor da ação.
const { auditContext } = require('../audit/audit-service');
// CSV.
const { formatDecimal, sendCsv, toCsv } = require('../../utils/csv');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

// Colunas da exportação (o e-mail sai mascarado; o valor com vírgula decimal).
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

/*
 * list — GET /api/v1/donations
 */
exports.list = async (req, res) => {
  const { items, total } = await donationService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * summary — GET /api/v1/donations/summary (?de=&ate=)
 */
exports.summary = async (req, res) => {
  return res.json(successResponse(await donationService.summary(req.query)));
};

/*
 * monthly — GET /api/v1/donations/monthly (?meses=)
 */
exports.monthly = async (req, res) => {
  return res.json(successResponse(await donationService.monthly(req.query)));
};

/*
 * exportCsv — GET /api/v1/donations/export
 */
exports.exportCsv = async (req, res) => {
  const rows = await donationService.listForExport(req.query, auditContext(req));
  return sendCsv(res, `doacoes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
};

/*
 * getById — GET /api/v1/donations/:id
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await donationService.getById(req.params.id)));
};

/*
 * create — POST /api/v1/donations (registro manual). Retorno: 201.
 */
exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await donationService.create(req.body, auditContext(req))));
};

/*
 * update — PATCH /api/v1/donations/:id
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await donationService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas protegidas chamam estas funções, que repassam ao donation-service e
 *   respondem no formato padrão (ou como CSV, na exportação).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Endpoints de relatório (summary, monthly) além do CRUD.
 *   - Exportação CSV com colunas calculadas.
 * ============================================================================
 */
