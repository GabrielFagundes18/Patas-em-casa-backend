/*
 * ============================================================================
 * ARQUIVO: user-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS da EQUIPE no painel (prefixo /api/v1/users). Todas exigem
 *   login; ver exige team:read, criar exige team:create e editar/senha/convite
 *   exigem team:update (na matriz, só o administrador tem essas permissões).
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./user-controller e ./user-validators.
 *   - Middlewares: async-handler, auth, validate-request. utils/validators.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerUsers = require('./user-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Valida :id.
const { validateIdParam } = require('../../utils/validators');
// Validadores da equipe.
const {
  validateCreateUser,
  validateListUsers,
  validateResetPassword,
  validateUpdateUser,
} = require('./user-validators');

// Roteador.
const router = express.Router();

// Todas exigem login.
router.use(requireAuth);

// Listar e criar.
router.get('/', requirePermission('team:read'), validateRequest(validateListUsers), asyncHandler(ControllerUsers.list));
router.post('/', requirePermission('team:create'), validateRequest(validateCreateUser), asyncHandler(ControllerUsers.create));
// Ver e editar.
router.get('/:id', requirePermission('team:read'), validateRequest(validateIdParam), asyncHandler(ControllerUsers.getById));
router.patch('/:id', requirePermission('team:update'), validateRequest(validateIdParam), validateRequest(validateUpdateUser), asyncHandler(ControllerUsers.update));
// Definir nova senha e (re)enviar convite.
router.post('/:id/password', requirePermission('team:update'), validateRequest(validateIdParam), validateRequest(validateResetPassword), asyncHandler(ControllerUsers.resetPassword));
router.post('/:id/invite', requirePermission('team:update'), validateRequest(validateIdParam), asyncHandler(ControllerUsers.sendInvite));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth → permissão team:* → validação → controller → user-service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Rotas de "ação" sobre um recurso (/:id/password, /:id/invite).
 * ============================================================================
 */
