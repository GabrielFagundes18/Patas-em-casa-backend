/*
 * ============================================================================
 * ARQUIVO: story-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER das HISTÓRIAS DE ADOÇÃO no painel: listar, ver, criar, editar
 *   (inclusive publicar/despublicar) e excluir. (A lista pública do site fica
 *   no public-controller.)
 *
 * PRINCIPAIS FUNÇÕES:
 *   - list, getById, create, update, remove.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./story-service, ../audit/audit-service, utils/http-response, utils/pagination.
 *   - Usado por: ./story-routes.js.
 * ============================================================================
 */

// Regras das histórias.
const storyService = require('./story-service');
// Autor da ação.
const { auditContext } = require('../audit/audit-service');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

/*
 * list — GET /api/v1/stories
 */
exports.list = async (req, res) => {
  const { items, total } = await storyService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * getById — GET /api/v1/stories/:id
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await storyService.getById(req.params.id)));
};

/*
 * create — POST /api/v1/stories (201)
 */
exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await storyService.create(req.body, auditContext(req))));
};

/*
 * update — PATCH /api/v1/stories/:id
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await storyService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * remove — DELETE /api/v1/stories/:id (204)
 */
exports.remove = async (req, res) => {
  await storyService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Rotas protegidas → estas funções → story-service → resposta padrão (200, 201 ou 204).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - CRUD completo em poucas linhas com controllers finos.
 * ============================================================================
 */
