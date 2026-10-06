const express = require('express');
const ControllerUsers = require('../controller/controller-users');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam } = require('../validators/common-validators');
const {
  validateCreateUser,
  validateListUsers,
  validateResetPassword,
  validateUpdateUser,
} = require('../validators/users/user-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('team:read'), validateRequest(validateListUsers), asyncHandler(ControllerUsers.list));
router.post('/', requirePermission('team:create'), validateRequest(validateCreateUser), asyncHandler(ControllerUsers.create));
router.get('/:id', requirePermission('team:read'), validateRequest(validateIdParam), asyncHandler(ControllerUsers.getById));
router.patch('/:id', requirePermission('team:update'), validateRequest(validateIdParam), validateRequest(validateUpdateUser), asyncHandler(ControllerUsers.update));
router.post('/:id/password', requirePermission('team:update'), validateRequest(validateIdParam), validateRequest(validateResetPassword), asyncHandler(ControllerUsers.resetPassword));
router.post('/:id/invite', requirePermission('team:update'), validateRequest(validateIdParam), asyncHandler(ControllerUsers.sendInvite));

module.exports = router;
