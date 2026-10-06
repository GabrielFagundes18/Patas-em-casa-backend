const express = require('express');
const ControllerVolunteers = require('../controller/controller-volunteers');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam } = require('../validators/common-validators');
const {
  validateCreateVolunteer,
  validateListVolunteers,
  validateUpdateVolunteer,
} = require('../validators/volunteers/volunteer-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('volunteers:read'), validateRequest(validateListVolunteers), asyncHandler(ControllerVolunteers.list));
router.get('/:id', requirePermission('volunteers:read'), validateRequest(validateIdParam), asyncHandler(ControllerVolunteers.getById));
router.post('/', requirePermission('volunteers:create'), validateRequest(validateCreateVolunteer), asyncHandler(ControllerVolunteers.create));
router.patch('/:id', requirePermission('volunteers:update'), validateRequest(validateIdParam), validateRequest(validateUpdateVolunteer), asyncHandler(ControllerVolunteers.update));
router.delete('/:id', requirePermission('volunteers:delete'), validateRequest(validateIdParam), asyncHandler(ControllerVolunteers.remove));

module.exports = router;
