const express = require('express');
const ControllerPublic = require('../controller/controller-public');
const asyncHandler = require('../middleware/async-handler');
const rateLimit = require('../middleware/rate-limit');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam, listQueryDetails } = require('../validators/common-validators');
const { validateListAnimals } = require('../validators/animals/animal-validators');
const validateAdoptionRequest = require('../validators/adoptions/adoption-request-validator');
const { validateVolunteerApplication } = require('../validators/volunteers/volunteer-validators');

// Rotas sem login: só dados públicos. Formulários têm limite de envios por IP.
const router = express.Router();
const publicFormRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const validatePublicPage = ({ query }) => listQueryDetails(query, ['criado_em']);

router.get('/animals', validateRequest(validateListAnimals), asyncHandler(ControllerPublic.listAnimals));
router.get('/animals/:id', validateRequest(validateIdParam), asyncHandler(ControllerPublic.getAnimal));
router.get('/stories', validateRequest(validatePublicPage), asyncHandler(ControllerPublic.listStories));
router.get('/adoption-steps', asyncHandler(ControllerPublic.listAdoptionSteps));
router.get('/stats', asyncHandler(ControllerPublic.getStats));
router.post('/adoption-requests', publicFormRateLimit, validateRequest(validateAdoptionRequest), asyncHandler(ControllerPublic.createAdoptionRequest));
router.post('/volunteers', publicFormRateLimit, validateRequest(validateVolunteerApplication), asyncHandler(ControllerPublic.applyAsVolunteer));

module.exports = router;
