/*
 * ============================================================================
 * ARQUIVO: volunteer-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS dos VOLUNTÁRIOS no painel (prefixo /api/v1/volunteers).
 *   Todas exigem login e a permissão volunteers:read/create/update/delete.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./volunteer-controller e ./volunteer-validators.
 *   - Middlewares: async-handler, auth, validate-request. utils/validators.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerVolunteers = require('./volunteer-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Valida :id.
const { validateIdParam } = require('../../utils/validators');
// Validadores dos voluntários.
const {
  validateCreateVolunteer,
  validateListVolunteers,
  validateUpdateVolunteer,
} = require('./volunteer-validators');

// Roteador.
const router = express.Router();

// Todas exigem login.
router.use(requireAuth);

// Listar, ver, cadastrar, editar e excluir.
router.get('/', requirePermission('volunteers:read'), validateRequest(validateListVolunteers), asyncHandler(ControllerVolunteers.list));
router.get('/:id', requirePermission('volunteers:read'), validateRequest(validateIdParam), asyncHandler(ControllerVolunteers.getById));
router.post('/', requirePermission('volunteers:create'), validateRequest(validateCreateVolunteer), asyncHandler(ControllerVolunteers.create));
router.patch('/:id', requirePermission('volunteers:update'), validateRequest(validateIdParam), validateRequest(validateUpdateVolunteer), asyncHandler(ControllerVolunteers.update));
router.delete('/:id', requirePermission('volunteers:delete'), validateRequest(validateIdParam), asyncHandler(ControllerVolunteers.remove));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth → permissão → validação → controller.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Organização de rotas REST por recurso.
 * ============================================================================
 */
