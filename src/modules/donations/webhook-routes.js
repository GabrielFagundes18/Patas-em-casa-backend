/*
 * ============================================================================
 * ARQUIVO: webhook-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS DE WEBHOOK (prefixo /api/v1/webhooks). Um WEBHOOK é uma
 *   requisição que um serviço externo faz para a nossa API para AVISAR que algo
 *   aconteceu (ex.: "o pagamento X foi aprovado"). Aqui fica a rota do Mercado Pago.
 *   Não há login: quem garante que o aviso é verdadeiro é a ASSINATURA HMAC,
 *   conferida no service.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./online-donation-controller (mercadoPagoWebhook) e middleware/async-handler.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller das doações online.
const ControllerOnlineDonations = require('./online-donation-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');

// Notificações de serviços externos. Sem login: a autenticidade vem da assinatura de cada provedor.
const router = express.Router();

// POST /api/v1/webhooks/mercadopago
router.post('/mercadopago', asyncHandler(ControllerOnlineDonations.mercadoPagoWebhook));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O Mercado Pago chama POST /api/v1/webhooks/mercadopago → controller → service
 *   (confere assinatura, evita processar o mesmo aviso duas vezes e atualiza a doação).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Webhooks: o que são e como autenticar (assinatura HMAC em vez de login).
 * ============================================================================
 */
