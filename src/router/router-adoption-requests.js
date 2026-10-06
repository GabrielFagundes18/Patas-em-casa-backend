const express = require('express');
const ControllerAdoptionRequests = require('../controller/controller-adoption-requests');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam } = require('../validators/common-validators');
const {
  validateBoard,
  validateDecision,
  validateListRequests,
  validateSchedule,
  validateUpdateRequest,
} = require('../validators/adoptions/adoption-triage-validators');

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
router.post('/:id/term-signed', requirePermission('adoptions:update'), validateRequest(validateIdParam), asyncHandler(ControllerAdoptionRequests.markTermSigned));

module.exports = router;
