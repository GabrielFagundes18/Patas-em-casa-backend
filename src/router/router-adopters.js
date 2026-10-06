const express = require('express');
const ControllerAdopters = require('../controller/controller-adopters');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam } = require('../validators/common-validators');
const {
  validateConfirmation,
  validateListAdopters,
  validateUpdateAdopter,
} = require('../validators/adopters/adopter-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('adopters:read'), validateRequest(validateListAdopters), asyncHandler(ControllerAdopters.list));
router.get('/export', requirePermission('adopters:export'), validateRequest(validateListAdopters), asyncHandler(ControllerAdopters.exportCsv));
router.get('/:id', requirePermission('adopters:read'), validateRequest(validateIdParam), asyncHandler(ControllerAdopters.getById));
router.post('/:id/reveal', requirePermission('adopters:reveal'), validateRequest(validateIdParam), asyncHandler(ControllerAdopters.reveal));
router.patch('/:id', requirePermission('adopters:update'), validateRequest(validateIdParam), validateRequest(validateUpdateAdopter), asyncHandler(ControllerAdopters.update));
router.get('/:id/lgpd-export', requirePermission('lgpd:approve'), validateRequest(validateIdParam), asyncHandler(ControllerAdopters.exportTitularData));
router.post('/:id/anonymize', requirePermission('lgpd:approve'), validateRequest(validateIdParam), validateRequest(validateConfirmation('ANONIMIZAR')), asyncHandler(ControllerAdopters.anonymize));
router.delete('/:id', requirePermission('lgpd:approve'), validateRequest(validateIdParam), validateRequest(validateConfirmation('EXCLUIR')), asyncHandler(ControllerAdopters.remove));

module.exports = router;
