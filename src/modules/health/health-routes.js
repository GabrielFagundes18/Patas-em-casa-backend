const express = require('express');
const ControllerHealth = require('./health-controller');

const router = express.Router();

router.get('/', ControllerHealth.getApiInfo);
router.get('/health', ControllerHealth.checkHealth);
router.get('/ready', ControllerHealth.checkReadiness);

module.exports = router;