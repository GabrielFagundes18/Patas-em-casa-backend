/*
 * ============================================================================
 * ARQUIVO: volunteer-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER dos VOLUNTÁRIOS no painel: listar, ver, cadastrar, editar e
 *   excluir. (A inscrição pelo site usa o public-controller → volunteerService.apply.)
 *
 * PRINCIPAIS FUNÇÕES:
 *   - list, getById, create, update, remove.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./volunteer-service, ../audit/audit-service, utils/http-response, utils/pagination.
 *   - Usado por: ./volunteer-routes.js.
 * ============================================================================
 */

// Regras dos voluntários.
const volunteerService = require('./volunteer-service');
// Autor da ação.
const { auditContext } = require('../audit/audit-service');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

/*
 * list — GET /api/v1/volunteers
 */
exports.list = async (req, res) => {
  const { items, total } = await volunteerService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * getById — GET /api/v1/volunteers/:id
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await volunteerService.getById(req.params.id)));
};

/*
 * create — POST /api/v1/volunteers (201)
 */
exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await volunteerService.create(req.body, auditContext(req))));
};

/*
 * update — PATCH /api/v1/volunteers/:id
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await volunteerService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * remove — DELETE /api/v1/volunteers/:id (204)
 */
exports.remove = async (req, res) => {
  await volunteerService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Rotas protegidas → estas funções → volunteer-service → resposta padrão.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Controllers finos e o padrão de respostas da API.
 * ============================================================================
 */
