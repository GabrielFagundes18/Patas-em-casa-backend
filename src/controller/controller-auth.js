const authService = require('../services/auth/auth-service');
const auditService = require('../services/audit/audit-service');
const { readConfig } = require('../config/env');
const { parseCookies, serializeCookie } = require('../utils/cookies');
const { successResponse } = require('../utils/http-response');

const { nodeEnv, sessionIdleMinutes } = readConfig();
const REFRESH_COOKIE = 'patas_refresh';
const refreshCookieOptions = {
  path: '/api/v1/auth',
  httpOnly: true,
  secure: nodeEnv === 'production',
  sameSite: 'Strict',
};

function setRefreshCookie(res, refreshToken) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, refreshToken, {
    ...refreshCookieOptions,
    maxAgeSeconds: sessionIdleMinutes * 60,
  }));
}

function clearRefreshCookie(res) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, '', { ...refreshCookieOptions, maxAgeSeconds: 0 }));
}

exports.login = async (req, res) => {
  const { refreshToken, ...session } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  return res.json(successResponse(session));
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken, ...session } = await authService.refresh(parseCookies(req.headers.cookie)[REFRESH_COOKIE]);
    setRefreshCookie(res, refreshToken);
    return res.json(successResponse(session));
  } catch (error) {
    if (error.status === 401) clearRefreshCookie(res);
    return next(error);
  }
};

exports.logout = (req, res) => {
  clearRefreshCookie(res);
  return res.status(204).end();
};

exports.me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.sub);
  return res.json(successResponse(user));
};

exports.changePassword = async (req, res) => {
  await authService.changeOwnPassword(req.user.sub, req.body);
  await auditService.record({
    actor: auditService.auditContext(req),
    action: 'alterar_propria_senha',
    module: 'team',
    entity: 'usuario',
    entityId: req.user.sub,
  });
  return res.status(204).end();
};
