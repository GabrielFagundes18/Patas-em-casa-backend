/*
 * ============================================================================
 * ARQUIVO: donation-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS de DOAÇÕES do painel (prefixo /api/v1/donations), incluindo
 *   as das doações mensais online (assinaturas do Mercado Pago). Todas exigem
 *   login e a permissão adequada (donations:read, create, update ou export).
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./donation-controller e ./donation-validators.
 *   - ./online-donation-controller e ./online-donation-validators (assinaturas).
 *   - Middlewares: async-handler, auth, validate-request. utils/validators.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller das doações.
const ControllerDonations = require('./donation-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Valida :id.
const { validateIdParam } = require('../../utils/validators');
// Validadores das doações.
const {
  validateCreateDonation,
  validateListDonations,
  validateMonthly,
  validateSummary,
  validateUpdateDonation,
} = require('./donation-validators');

// Assinaturas (doações mensais online): controller e validador.
const ControllerOnlineDonations = require('./online-donation-controller');
const { validateListSubscriptions } = require('./online-donation-validators');

// Roteador.
const router = express.Router();

// Todas exigem login.
router.use(requireAuth);

// Lista, resumo, série mensal e exportação (caminhos fixos antes de "/:id").
router.get('/', requirePermission('donations:read'), validateRequest(validateListDonations), asyncHandler(ControllerDonations.list));
router.get('/summary', requirePermission('donations:read'), validateRequest(validateSummary), asyncHandler(ControllerDonations.summary));
router.get('/monthly', requirePermission('donations:read'), validateRequest(validateMonthly), asyncHandler(ControllerDonations.monthly));
router.get('/export', requirePermission('donations:export'), validateRequest(validateListDonations), asyncHandler(ControllerDonations.exportCsv));
// Assinaturas: listar e cancelar.
router.get('/subscriptions', requirePermission('donations:read'), validateRequest(validateListSubscriptions), asyncHandler(ControllerOnlineDonations.listSubscriptions));
router.post('/subscriptions/:id/cancel', requirePermission('donations:update'), validateRequest(validateIdParam), asyncHandler(ControllerOnlineDonations.cancelSubscription));
// Detalhes, registro manual e edição.
router.get('/:id', requirePermission('donations:read'), validateRequest(validateIdParam), asyncHandler(ControllerDonations.getById));
router.post('/', requirePermission('donations:create'), validateRequest(validateCreateDonation), asyncHandler(ControllerDonations.create));
router.patch('/:id', requirePermission('donations:update'), validateRequest(validateIdParam), validateRequest(validateUpdateDonation), asyncHandler(ControllerDonations.update));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth → permissão → validação → controller. As rotas com caminho fixo
 *   (/summary, /monthly, /export, /subscriptions) vêm antes de "/:id" para não
 *   serem confundidas com um id.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Ordem de declaração das rotas no Express.
 *   - Um roteador usando controllers de dois arquivos diferentes.
 * ============================================================================
 */
