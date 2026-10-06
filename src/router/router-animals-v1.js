const express = require('express');
const ControllerAnimals = require('../controller/controller-animals-v1');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const {
  validateAnimalId,
  validateAnimalStatus,
  validateCreateAnimal,
  validateListAnimals,
  validateUpdateAnimal,
} = require('../validators/animals/animal-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('animals:read'), validateRequest(validateListAnimals), asyncHandler(ControllerAnimals.list));
router.get('/export', requirePermission('animals:export'), validateRequest(validateListAnimals), asyncHandler(ControllerAnimals.exportCsv));
router.post('/', requirePermission('animals:create'), validateRequest(validateCreateAnimal), asyncHandler(ControllerAnimals.create));
router.patch('/:id/status', requirePermission('animals:update'), validateRequest(validateAnimalId), validateRequest(validateAnimalStatus), asyncHandler(ControllerAnimals.updateStatus));
router.get('/:id', requirePermission('animals:read'), validateRequest(validateAnimalId), asyncHandler(ControllerAnimals.getById));
router.put('/:id', requirePermission('animals:update'), validateRequest(validateAnimalId), validateRequest(validateUpdateAnimal), asyncHandler(ControllerAnimals.update));
router.delete('/:id', requirePermission('animals:delete'), validateRequest(validateAnimalId), asyncHandler(ControllerAnimals.remove));

module.exports = router;
