const express = require('express');
const ControllerOnlineDonations = require('../controller/controller-online-donations');
const asyncHandler = require('../middleware/async-handler');

// Notificações de serviços externos. Sem login: a autenticidade vem da assinatura de cada provedor.
const router = express.Router();

router.post('/mercadopago', asyncHandler(ControllerOnlineDonations.mercadoPagoWebhook));

module.exports = router;
