const jwt = require('jsonwebtoken');
const AppError = require('../utils/app-error');
const { getPermissionsForRole, hasPermission } = require('../config/permissions');
const { readConfig } = require('../config/env');
const userRepository = require('../modules/users/user-repository');
const sessionRepository = require('../modules/auth/session-repository');
const { UUID_PATTERN } = require('../utils/validators');

const { jwtSecret } = readConfig();

function signToken(payload) {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new AppError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou não autenticada.'));
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (error) {
    return next(new AppError(401, 'TOKEN_INVALIDO', 'Token inválido ou expirado.'));
  }

  try {
    // Cargo e situação vêm do banco a cada requisição, e não do token: troca de cargo
    // e desativação valem imediatamente, sem esperar o token expirar.
    const user = UUID_PATTERN.test(String(payload.sub))
      ? await userRepository.findById(payload.sub)
      : null;

    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      return next(new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.'));
    }

    // Sessão revogada (logout, troca de senha, desativação) derruba o token na hora, sem esperar expirar.
    if (payload.sid !== undefined) {
      const session = UUID_PATTERN.test(String(payload.sid)) ? await sessionRepository.findActive(payload.sid) : null;
      if (!session || session.usuario_id !== user.id) {
        return next(new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.'));
      }
    }

    req.user = { sub: user.id, email: user.email, nome: user.nome, role: user.cargo, sid: payload.sid };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou não autenticada.'));
    }

    if (!hasPermission(req.user.role, permission)) {
      return next(new AppError(403, 'SEM_PERMISSAO', 'Você não tem permissão para esta ação.'));
    }

    return next();
  };
}

module.exports = { signToken, requireAuth, requirePermission };
