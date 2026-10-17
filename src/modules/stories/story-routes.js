/*
 * ============================================================================
 * ARQUIVO: story-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS das HISTÓRIAS no painel (prefixo /api/v1/stories). Todas
 *   exigem login e a permissão stories:read/create/update/delete conforme a ação.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./story-controller e ./story-validators.
 *   - Middlewares: async-handler, auth, validate-request. utils/validators.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerStories = require('./story-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Valida :id.
const { validateIdParam } = require('../../utils/validators');
// Validadores das histórias.
const {
  validateCreateStory,
  validateListStories,
  validateUpdateStory,
} = require('./story-validators');

// Roteador.
const router = express.Router();

// Todas exigem login.
router.use(requireAuth);

// Listar, ver, criar, editar e excluir.
router.get('/', requirePermission('stories:read'), validateRequest(validateListStories), asyncHandler(ControllerStories.list));
router.get('/:id', requirePermission('stories:read'), validateRequest(validateIdParam), asyncHandler(ControllerStories.getById));
router.post('/', requirePermission('stories:create'), validateRequest(validateCreateStory), asyncHandler(ControllerStories.create));
router.patch('/:id', requirePermission('stories:update'), validateRequest(validateIdParam), validateRequest(validateUpdateStory), asyncHandler(ControllerStories.update));
router.delete('/:id', requirePermission('stories:delete'), validateRequest(validateIdParam), asyncHandler(ControllerStories.remove));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth → permissão da ação → validação → controller.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Mapeamento REST: GET (ler), POST (criar), PATCH (editar), DELETE (excluir).
 * ============================================================================
 */
