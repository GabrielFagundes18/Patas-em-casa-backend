/*
 * ============================================================================
 * ARQUIVO: adopter-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS dos ADOTANTES no painel (prefixo /api/v1/adopters). Todas
 *   exigem login. As ações irreversíveis da LGPD (anonimizar, excluir) exigem a
 *   permissão "lgpd:approve" e a digitação de uma palavra de confirmação.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./adopter-controller e ./adopter-validators.
 *   - Middlewares: async-handler, auth, validate-request. utils/validators.
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerAdopters = require('./adopter-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Valida :id.
const { validateIdParam } = require('../../utils/validators');
// Validadores do módulo.
const {
  validateConfirmation,
  validateListAdopters,
  validateUpdateAdopter,
} = require('./adopter-validators');

// Roteador.
const router = express.Router();

// Todas as rotas exigem login.
router.use(requireAuth);

// Listar.
router.get('/', requirePermission('adopters:read'), validateRequest(validateListAdopters), asyncHandler(ControllerAdopters.list));
// Exportar CSV (antes de "/:id").
router.get('/export', requirePermission('adopters:export'), validateRequest(validateListAdopters), asyncHandler(ControllerAdopters.exportCsv));
// Detalhes.
router.get('/:id', requirePermission('adopters:read'), validateRequest(validateIdParam), asyncHandler(ControllerAdopters.getById));
// Revelar contatos completos.
router.post('/:id/reveal', requirePermission('adopters:reveal'), validateRequest(validateIdParam), asyncHandler(ControllerAdopters.reveal));
// Editar.
router.patch('/:id', requirePermission('adopters:update'), validateRequest(validateIdParam), validateRequest(validateUpdateAdopter), asyncHandler(ControllerAdopters.update));
// LGPD: exportar dados do titular.
router.get('/:id/lgpd-export', requirePermission('lgpd:approve'), validateRequest(validateIdParam), asyncHandler(ControllerAdopters.exportTitularData));
// LGPD: anonimizar (exige digitar "ANONIMIZAR").
router.post('/:id/anonymize', requirePermission('lgpd:approve'), validateRequest(validateIdParam), validateRequest(validateConfirmation('ANONIMIZAR')), asyncHandler(ControllerAdopters.anonymize));
// LGPD: excluir (exige digitar "EXCLUIR").
router.delete('/:id', requirePermission('lgpd:approve'), validateRequest(validateIdParam), validateRequest(validateConfirmation('EXCLUIR')), asyncHandler(ControllerAdopters.remove));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth → permissão da rota → validações (id, corpo, confirmação) →
 *   controller. Revelar e exportar exigem permissões próprias; LGPD exige
 *   lgpd:approve (só administrador) e confirmação digitada.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Proteger ações destrutivas com permissão específica + confirmação explícita.
 *   - Validadores criados por "fábrica" (validateConfirmation('PALAVRA')).
 * ============================================================================
 */
