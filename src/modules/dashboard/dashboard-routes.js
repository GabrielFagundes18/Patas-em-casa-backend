const express = require('express');
const ControllerDashboard = require('./dashboard-controller');
const asyncHandler = require('../../middleware/async-handler');
const { requireAuth, requirePermission } = require('../../middleware/auth');

const router = express.Router();

router.get('/summary', requireAuth, requirePermission('dashboard:read'), asyncHandler(ControllerDashboard.summary));

module.exports = router;
