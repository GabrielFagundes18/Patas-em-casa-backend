/*
 * ============================================================================
 * ARQUIVO: auth-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS DE AUTENTICAÇÃO (montadas em /api/v1):
 *     POST /auth/login, /auth/refresh, /auth/logout,
 *     POST /auth/forgot-password, /auth/reset-password,
 *     GET /me e PATCH /me/password.
 *   Cada rota recebe as proteções adequadas: limite de tentativas, cabeçalho
 *   anti-CSRF, validação dos dados e/ou exigência de login.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado), loginRateLimit, passwordResetRateLimit.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./auth-controller (respostas) e os validadores deste módulo.
 *   - Middlewares: async-handler, auth (requireAuth), csrf, rate-limit, validate-request.
 *   - Montado em src/app.js no prefixo "/api/v1".
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller de autenticação.
const ControllerAuth = require('./auth-controller');
// Repassa erros de funções async.
const asyncHandler = require('../../middleware/async-handler');
// Exige login.
const { requireAuth } = require('../../middleware/auth');
// Exige o cabeçalho anti-CSRF.
const requireAjaxHeader = require('../../middleware/csrf');
// Limite de requisições.
const rateLimit = require('../../middleware/rate-limit');
// Executa validadores.
const validateRequest = require('../../middleware/validate-request');
// Validadores do módulo.
const validateLogin = require('./login-validator');
const validateChangePassword = require('./change-password-validator');
const { validateForgotPassword, validateResetPassword } = require('./password-reset-validators');

// Roteador.
const router = express.Router();
// Login: até 20 tentativas a cada 15 minutos por IP (além do bloqueio por conta do login-throttle).
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// Pedidos de link e redefinições por IP: evita disparo de e-mails e tentativas de adivinhar tokens.
const passwordResetRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Login: limite → validação → controller.
router.post('/auth/login', loginRateLimit, validateRequest(validateLogin), asyncHandler(ControllerAuth.login));
// Renovação e logout usam o cookie: exigem o cabeçalho anti-CSRF.
router.post('/auth/refresh', requireAjaxHeader, asyncHandler(ControllerAuth.refresh));
router.post('/auth/logout', requireAjaxHeader, asyncHandler(ControllerAuth.logout));
// Esqueci a senha / redefinir senha: limite → validação → controller.
router.post('/auth/forgot-password', passwordResetRateLimit, validateRequest(validateForgotPassword), asyncHandler(ControllerAuth.forgotPassword));
router.post('/auth/reset-password', passwordResetRateLimit, validateRequest(validateResetPassword), asyncHandler(ControllerAuth.resetPassword));
// Dados do usuário logado.
router.get('/me', requireAuth, asyncHandler(ControllerAuth.me));
// Troca da própria senha (PATCH = alteração parcial de um recurso).
router.patch('/me/password', requireAuth, validateRequest(validateChangePassword), asyncHandler(ControllerAuth.changePassword));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Rotas abertas (login, esqueci/redefinir senha) são protegidas por limite de
 *   tentativas e validação. Rotas do cookie (refresh, logout) exigem o cabeçalho
 *   anti-CSRF. Rotas do usuário (/me) exigem o token de acesso (requireAuth).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Proteção contra força bruta (rate limit por IP + bloqueio por conta).
 *   - CSRF em rotas que dependem de cookies.
 *   - Métodos HTTP: GET, POST e PATCH.
 * ============================================================================
 */
