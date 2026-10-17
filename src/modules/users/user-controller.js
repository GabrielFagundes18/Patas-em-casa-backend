/*
 * ============================================================================
 * ARQUIVO: user-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER da EQUIPE (usuários do painel): listar, ver, criar (com senha
 *   inicial ou convite por e-mail), editar, redefinir a senha de um membro,
 *   (re)enviar convite e mostrar a matriz de permissões.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - list, getById, create, update, resetPassword, sendInvite, permissionMatrix.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./user-service, ../audit/audit-service, config/permissions (getPermissionMatrix),
 *     utils/http-response, utils/pagination.
 *   - Usado por: ./user-routes.js e modules/permissions/permission-routes.js.
 *   - No frontend: admin/team (TeamPage, teamService).
 * ============================================================================
 */

// Regras da equipe.
const userService = require('./user-service');
// Autor da ação.
const { auditContext } = require('../audit/audit-service');
// Matriz de permissões.
const { getPermissionMatrix } = require('../../config/permissions');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

/*
 * list — GET /api/v1/users
 */
exports.list = async (req, res) => {
  const { items, total } = await userService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * getById — GET /api/v1/users/:id
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await userService.getById(req.params.id)));
};

/*
 * create — POST /api/v1/users (201). A resposta inclui "convite" com o resultado do envio, se pedido.
 */
exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await userService.create(req.body, auditContext(req))));
};

/*
 * update — PATCH /api/v1/users/:id
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await userService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * resetPassword — POST /api/v1/users/:id/password (204)
 * O administrador define uma nova senha para o membro; as sessões dele são encerradas.
 */
exports.resetPassword = async (req, res) => {
  await userService.resetPassword(req.params.id, req.body, auditContext(req));
  return res.status(204).end();
};

/*
 * sendInvite — POST /api/v1/users/:id/invite
 * Retorno: { enviado, motivo? }.
 */
exports.sendInvite = async (req, res) => {
  return res.json(successResponse(await userService.sendInvite(req.params.id, auditContext(req))));
};

/*
 * permissionMatrix — GET /api/v1/permissions
 * Função síncrona (sem async): a matriz já está pronta na memória.
 */
exports.permissionMatrix = (req, res) => res.json(successResponse(getPermissionMatrix()));

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Rotas protegidas (team:read/create/update) → estas funções → user-service →
 *   resposta padrão. A matriz de permissões vem direto de config/permissions.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Gestão de usuários: criação, convite, redefinição de senha, desativação.
 *   - Arrow function com retorno implícito (sem chaves e sem "return").
 * ============================================================================
 */
