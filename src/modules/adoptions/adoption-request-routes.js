const express = require('express');
const ControllerAdoptionRequests = require('./adoption-request-controller');
const asyncHandler = require('../../middleware/async-handler');
const { requireAuth, requirePermission } = require('../../middleware/auth');
const validateRequest = require('../../middleware/validate-request');
const { validateIdParam } = require('../../utils/validators');
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

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('adoptions:read'), validateRequest(validateListRequests), asyncHandler(ControllerAdoptionRequests.list));
router.get('/board', requirePermission('adoptions:read'), validateRequest(validateBoard), asyncHandler(ControllerAdoptionRequests.board));
router.get('/:id', requirePermission('adoptions:read'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.getById));
router.post('/:id/reveal', requirePermission('adopters:reveal'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.reveal));
router.patch('/:id', requirePermission('adoptions:update'), validateRequest(validateIdParam), validateRequest(validateUpdateRequest), asyncHandler(ControllerAdoptionRequests.update));
router.post('/:id/approve', requirePermission('adoptions:approve'), validateRequest(validateIdParam), validateRequest(validateDecision), asyncHandler(ControllerAdoptionRequests.approve));
router.post('/:id/reject', requirePermission('adoptions:approve'), validateRequest(validateIdParam), validateRequest(validateDecision), asyncHandler(ControllerAdoptionRequests.reject));
router.post('/:id/schedule', requirePermission('adoptions:update'), validateRequest(validateIdParam), validateRequest(validateSchedule), asyncHandler(ControllerAdoptionRequests.schedule));
router.patch('/:id/appointments/:appointmentId', requirePermission('adoptions:update'), validateRequest(validateAppointmentParams), validateRequest(validateReschedule), asyncHandler(ControllerAdoptionRequests.reschedule));
router.post('/:id/appointments/:appointmentId/cancel', requirePermission('adoptions:update'), validateRequest(validateAppointmentParams), validateRequest(validateCancelAppointment), asyncHandler(ControllerAdoptionRequests.cancelAppointment));
router.post('/:id/appointments/:appointmentId/complete', requirePermission('adoptions:update'), validateRequest(validateAppointmentParams), asyncHandler(ControllerAdoptionRequests.completeAppointment));
router.post('/:id/term-signed', requirePermission('adoptions:update'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.markTermSigned));

module.exports = router;
