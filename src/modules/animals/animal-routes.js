/*
 * ============================================================================
 * ARQUIVO: animal-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS do cadastro de animais no painel (prefixo /api/v1/animals).
 *   Todas exigem login; cada uma exige também a permissão adequada
 *   (animals:read, create, update, delete ou export) e valida os dados.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./animal-controller e ./animal-validators.
 *   - Middlewares: async-handler, auth, validate-request, upload (fotos).
 *   - utils/validators (validateIdParam).
 *   - Montado em src/app.js.
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller.
const ControllerAnimals = require('./animal-controller');
// Repassa erros async.
const asyncHandler = require('../../middleware/async-handler');
// Autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Recebe arquivos de foto.
const { receivePhotos } = require('../../middleware/upload');
// Valida o :id da URL.
const { validateIdParam } = require('../../utils/validators');
// Validadores específicos de animais.
const {
  validateAnimalStatus,
  validateCreateAnimal,
  validatePhotoParams,
  validateListAnimals,
  validateUpdateAnimal,
} = require('./animal-validators');

// Roteador.
const router = express.Router();

// router.use(middleware): aplica requireAuth a TODAS as rotas abaixo (todas exigem login).
router.use(requireAuth);

// Listar animais.
router.get('/', requirePermission('animals:read'), validateRequest(validateListAnimals), asyncHandler(ControllerAnimals.list));
// Exportar CSV. Vem ANTES de "/:id" para "export" não ser entendido como um id.
router.get('/export', requirePermission('animals:export'), validateRequest(validateListAnimals), asyncHandler(ControllerAnimals.exportCsv));
// Cadastrar.
router.post('/', requirePermission('animals:create'), validateRequest(validateCreateAnimal), asyncHandler(ControllerAnimals.create));
// Mudar só o status (dois validadores em sequência: id e corpo).
router.patch('/:id/status', requirePermission('animals:update'), validateRequest(validateIdParam), validateRequest(validateAnimalStatus), asyncHandler(ControllerAnimals.updateStatus));
// Detalhes.
router.get('/:id', requirePermission('animals:read'), validateRequest(validateIdParam), asyncHandler(ControllerAnimals.getById));
// Editar.
router.put('/:id', requirePermission('animals:update'), validateRequest(validateIdParam), validateRequest(validateUpdateAnimal), asyncHandler(ControllerAnimals.update));
// Excluir.
router.delete('/:id', requirePermission('animals:delete'), validateRequest(validateIdParam), asyncHandler(ControllerAnimals.remove));
// Enviar fotos: valida o id, recebe os arquivos (multer) e chama o controller.
router.post('/:id/photos', requirePermission('animals:update'), validateRequest(validateIdParam), receivePhotos, asyncHandler(ControllerAnimals.addPhotos));
// Definir foto principal.
router.patch('/:id/photos/:photoId/principal', requirePermission('animals:update'), validateRequest(validatePhotoParams), asyncHandler(ControllerAnimals.setPrincipalPhoto));
// Remover foto.
router.delete('/:id/photos/:photoId', requirePermission('animals:update'), validateRequest(validatePhotoParams), asyncHandler(ControllerAnimals.removePhoto));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   requireAuth (todas) → requirePermission (por rota) → validateRequest
 *   (id/corpo/filtros) → [receivePhotos, no envio de fotos] → controller.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - router.use para aplicar um middleware a um grupo de rotas.
 *   - Ordem das rotas: caminhos fixos ("/export") antes dos dinâmicos ("/:id").
 *   - Rotas aninhadas (/:id/photos/:photoId) e parâmetros múltiplos.
 * ============================================================================
 */
