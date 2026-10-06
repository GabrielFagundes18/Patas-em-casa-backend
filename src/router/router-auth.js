const express = require('express');
const ControllerAuth = require('../controller/controller-auth');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth } = require('../middleware/auth');
const requireAjaxHeader = require('../middleware/csrf');
const rateLimit = require('../middleware/rate-limit');
const validateRequest = require('../middleware/validate-request');
const validateLogin = require('../validators/auth/login-validator');
const validateChangePassword = require('../validators/auth/change-password-validator');
const { validateForgotPassword, validateResetPassword } = require('../validators/auth/password-reset-validators');

const router = express.Router();
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// Pedidos de link e redefinições por IP: evita disparo de e-mails e tentativas de adivinhar tokens.
const passwordResetRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/auth/login', loginRateLimit, validateRequest(validateLogin), asyncHandler(ControllerAuth.login));
router.post('/auth/refresh', requireAjaxHeader, asyncHandler(ControllerAuth.refresh));
router.post('/auth/logout', requireAjaxHeader, asyncHandler(ControllerAuth.logout));
router.post('/auth/forgot-password', passwordResetRateLimit, validateRequest(validateForgotPassword), asyncHandler(ControllerAuth.forgotPassword));
router.post('/auth/reset-password', passwordResetRateLimit, validateRequest(validateResetPassword), asyncHandler(ControllerAuth.resetPassword));
router.get('/me', requireAuth, asyncHandler(ControllerAuth.me));
router.patch('/me/password', requireAuth, validateRequest(validateChangePassword), asyncHandler(ControllerAuth.changePassword));

module.exports = router;
