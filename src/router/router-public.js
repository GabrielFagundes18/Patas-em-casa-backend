const express = require('express');
const ControllerPublic = require('../controller/controller-public');
const asyncHandler = require('../middleware/async-handler');
const rateLimit = require('../middleware/rate-limit');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam, listQueryDetails } = require('../utils/validators');
const { validateListAnimals } = require('../validators/animals/animal-validators');
const validateAdoptionRequest = require('../validators/adoptions/adoption-request-validator');
const { validateVolunteerApplication } = require('../validators/volunteers/volunteer-validators');
const ControllerOnlineDonations = require('../controller/controller-online-donations');
const {
  validateCancelByToken,
  validateCancelLinkRequest,
  validateCheckout,
} = require('../validators/donations/online-donation-validators');

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
router.post('/donations/checkout', publicFormRateLimit, validateRequest(validateCheckout), asyncHandler(ControllerOnlineDonations.checkout));
router.get('/donations/status/:ref', asyncHandler(ControllerOnlineDonations.status));
router.post('/donations/subscriptions/cancel-link', publicFormRateLimit, validateRequest(validateCancelLinkRequest), asyncHandler(ControllerOnlineDonations.requestCancelLink));
router.post('/donations/subscriptions/cancel', publicFormRateLimit, validateRequest(validateCancelByToken), asyncHandler(ControllerOnlineDonations.cancelByToken));

module.exports = router;
