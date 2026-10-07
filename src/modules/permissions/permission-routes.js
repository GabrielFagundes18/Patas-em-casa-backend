const express = require('express');
const ControllerUsers = require('../users/user-controller');
const { requireAuth, requirePermission } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requirePermission('team:read'), ControllerUsers.permissionMatrix);

module.exports = router;
