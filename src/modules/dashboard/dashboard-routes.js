/*
 * ============================================================================
 * ARQUIVO: dashboard-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define a ROTA do painel inicial: GET /api/v1/dashboard/summary
 *   (exige login e a permissão dashboard:read, que todos os cargos têm).
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./dashboard-controller, middleware/async-handler, middleware/auth.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerDashboard = require('./dashboard-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');

// Roteador.
const router = express.Router();

// Resumo do painel: login → permissão → controller.
router.get('/summary', requireAuth, requirePermission('dashboard:read'), asyncHandler(ControllerDashboard.summary));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Uma única rota protegida que entrega o resumo do painel.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Middlewares encadeados na própria rota (requireAuth, requirePermission).
 * ============================================================================
 */
