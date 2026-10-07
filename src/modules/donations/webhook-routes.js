const express = require('express');
const ControllerOnlineDonations = require('./online-donation-controller');
const asyncHandler = require('../../middleware/async-handler');

// Notificações de serviços externos. Sem login: a autenticidade vem da assinatura de cada provedor.
const router = express.Router();

router.post('/mercadopago', asyncHandler(ControllerOnlineDonations.mercadoPagoWebhook));

module.exports = router;
