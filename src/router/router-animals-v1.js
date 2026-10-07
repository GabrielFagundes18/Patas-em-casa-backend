const express = require('express');
const ControllerAnimals = require('../controller/controller-animals-v1');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { receivePhotos } = require('../middleware/upload');
const { validateIdParam } = require('../utils/validators');
const {
  validateAnimalStatus,
  validateCreateAnimal,
  validatePhotoParams,
  validateListAnimals,
  validateUpdateAnimal,
} = require('../validators/animals/animal-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('animals:read'), validateRequest(validateListAnimals), asyncHandler(ControllerAnimals.list));
router.get('/export', requirePermission('animals:export'), validateRequest(validateListAnimals), asyncHandler(ControllerAnimals.exportCsv));
router.post('/', requirePermission('animals:create'), validateRequest(validateCreateAnimal), asyncHandler(ControllerAnimals.create));
router.patch('/:id/status', requirePermission('animals:update'), validateRequest(validateIdParam), validateRequest(validateAnimalStatus), asyncHandler(ControllerAnimals.updateStatus));
router.get('/:id', requirePermission('animals:read'), validateRequest(validateIdParam), asyncHandler(ControllerAnimals.getById));
router.put('/:id', requirePermission('animals:update'), validateRequest(validateIdParam), validateRequest(validateUpdateAnimal), asyncHandler(ControllerAnimals.update));
router.delete('/:id', requirePermission('animals:delete'), validateRequest(validateIdParam), asyncHandler(ControllerAnimals.remove));
router.post('/:id/photos', requirePermission('animals:update'), validateRequest(validateIdParam), receivePhotos, asyncHandler(ControllerAnimals.addPhotos));
router.patch('/:id/photos/:photoId/principal', requirePermission('animals:update'), validateRequest(validatePhotoParams), asyncHandler(ControllerAnimals.setPrincipalPhoto));
router.delete('/:id/photos/:photoId', requirePermission('animals:update'), validateRequest(validatePhotoParams), asyncHandler(ControllerAnimals.removePhoto));

module.exports = router;
