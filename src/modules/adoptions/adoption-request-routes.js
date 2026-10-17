/*
 * ============================================================================
 * ARQUIVO: adoption-request-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS da TRIAGEM DE PEDIDOS DE ADOÇÃO no painel (prefixo
 *   /api/v1/adoption-requests). Todas exigem login; ver exige adoptions:read,
 *   editar/agendar exige adoptions:update, decidir exige adoptions:approve e
 *   revelar contatos exige adopters:reveal.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./adoption-request-controller e ./adoption-triage-validators.
 *   - Middlewares: async-handler, auth, validate-request. utils/validators.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerAdoptionRequests = require('./adoption-request-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Valida :id.
const { validateIdParam } = require('../../utils/validators');
// Validadores da triagem.
const {
  validateAppointmentParams,
  validateBoard,
  validateCancelAppointment,
  validateDecision,
  validateListRequests,
  validateReschedule,
  validateSchedule,
  validateUpdateRequest,
} = require('./adoption-triage-validators');

// Roteador.
const router = express.Router();

// Todas exigem login.
router.use(requireAuth);

// Lista e quadro (antes de "/:id").
router.get('/', requirePermission('adoptions:read'), validateRequest(validateListRequests), asyncHandler(ControllerAdoptionRequests.list));
router.get('/board', requirePermission('adoptions:read'), validateRequest(validateBoard), asyncHandler(ControllerAdoptionRequests.board));
// Detalhes.
router.get('/:id', requirePermission('adoptions:read'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.getById));
// Revelar contatos (permissão do módulo de adotantes).
router.post('/:id/reveal', requirePermission('adopters:reveal'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.reveal));
// Editar.
router.patch('/:id', requirePermission('adoptions:update'), validateRequest(validateIdParam), validateRequest(validateUpdateRequest), asyncHandler(ControllerAdoptionRequests.update));
// Decisão: aprovar ou reprovar.
router.post('/:id/approve', requirePermission('adoptions:approve'), validateRequest(validateIdParam), validateRequest(validateDecision), asyncHandler(ControllerAdoptionRequests.approve));
router.post('/:id/reject', requirePermission('adoptions:approve'), validateRequest(validateIdParam), validateRequest(validateDecision), asyncHandler(ControllerAdoptionRequests.reject));
// Agenda: agendar, remarcar, cancelar e concluir compromissos.
router.post('/:id/schedule', requirePermission('adoptions:update'), validateRequest(validateIdParam), validateRequest(validateSchedule), asyncHandler(ControllerAdoptionRequests.schedule));
router.patch('/:id/appointments/:appointmentId', requirePermission('adoptions:update'), validateRequest(validateAppointmentParams), validateRequest(validateReschedule), asyncHandler(ControllerAdoptionRequests.reschedule));
router.post('/:id/appointments/:appointmentId/cancel', requirePermission('adoptions:update'), validateRequest(validateAppointmentParams), validateRequest(validateCancelAppointment), asyncHandler(ControllerAdoptionRequests.cancelAppointment));
router.post('/:id/appointments/:appointmentId/complete', requirePermission('adoptions:update'), validateRequest(validateAppointmentParams), asyncHandler(ControllerAdoptionRequests.completeAppointment));
// Termo de adoção assinado.
router.post('/:id/term-signed', requirePermission('adoptions:update'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.markTermSigned));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth → permissão específica da ação → validação (ids e corpo) →
 *   controller → triage-service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Permissões diferentes para ver, editar e decidir (separação de funções).
 *   - Rotas REST para sub-recursos (/:id/appointments/:appointmentId).
 * ============================================================================
 */
