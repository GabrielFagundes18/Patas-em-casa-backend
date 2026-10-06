const express = require('express');
const ControllerDonations = require('../controller/controller-donations');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validateRequest = require('../middleware/validate-request');
const { validateIdParam } = require('../validators/common-validators');
const {
  validateCreateDonation,
  validateListDonations,
  validateMonthly,
  validateSummary,
  validateUpdateDonation,
} = require('../validators/donations/donation-validators');

const ControllerOnlineDonations = require('../controller/controller-online-donations');
const { validateListSubscriptions } = require('../validators/donations/online-donation-validators');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission('donations:read'), validateRequest(validateListDonations), asyncHandler(ControllerDonations.list));
router.get('/summary', requirePermission('donations:read'), validateRequest(validateSummary), asyncHandler(ControllerDonations.summary));
router.get('/monthly', requirePermission('donations:read'), validateRequest(validateMonthly), asyncHandler(ControllerDonations.monthly));
router.get('/export', requirePermission('donations:export'), validateRequest(validateListDonations), asyncHandler(ControllerDonations.exportCsv));
router.get('/subscriptions', requirePermission('donations:read'), validateRequest(validateListSubscriptions), asyncHandler(ControllerOnlineDonations.listSubscriptions));
router.post('/subscriptions/:id/cancel', requirePermission('donations:update'), validateRequest(validateIdParam), asyncHandler(ControllerOnlineDonations.cancelSubscription));
router.get('/:id', requirePermission('donations:read'), validateRequest(validateIdParam), asyncHandler(ControllerDonations.getById));
router.post('/', requirePermission('donations:create'), validateRequest(validateCreateDonation), asyncHandler(ControllerDonations.create));
router.patch('/:id', requirePermission('donations:update'), validateRequest(validateIdParam), validateRequest(validateUpdateDonation), asyncHandler(ControllerDonations.update));

module.exports = router;
