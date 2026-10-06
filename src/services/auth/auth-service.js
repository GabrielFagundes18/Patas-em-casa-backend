const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../../utils/app-error');
const { getPermissionsForRole } = require('../../config/permissions');
const { readConfig } = require('../../config/env');
const { signToken } = require('../../middleware/auth');
const { getPasswordProblems } = require('../../utils/password-policy');
const withTransaction = require('../../db/transaction');
const userRepository = require('../../repositories/auth/user-repository');
const sessionRepository = require('../../repositories/auth/session-repository');
const logger = require('../../utils/logger');
const accessLinkService = require('./access-link-service');
const loginThrottle = require('./login-throttle');

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
const BCRYPT_ROUNDS = 12;
const { refreshTokenSecret, sessionIdleMinutes, sessionMaxHours } = readConfig();

function serializeUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    cargo: user.cargo,
    permissions: getPermissionsForRole(user.cargo),
  };
}

function expiredSession() {
  return new AppError(401, 'SESSAO_EXPIRADA', 'Sua sessão expirou. Entre novamente.');
}

function weakPassword(problems, field) {
  return new AppError(422, 'SENHA_FRACA', 'A nova senha não atende à política de senha.', problems.map((message) => ({ field, message })));
}

function createAuthService({
  repository = userRepository,
  comparePassword = bcrypt.compare,
  hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  throttle = loginThrottle,
  sessions = sessionRepository,
  accessLinks = accessLinkService,
  transaction = withTransaction,
  now = () => Date.now(),
  log = logger,
} = {}) {
  // Os dois tokens carregam o id da sessão (sid): revogar a sessão no banco derruba ambos.
  function issueAccessToken(user, sessionId) {
    return signToken({ sub: user.id, email: user.email, role: user.cargo, nome: user.nome, sid: sessionId });
  }

  // Token de renovação: vale por SESSION_IDLE_MINUTES a partir do último uso (inatividade)
  // e nunca além de SESSION_MAX_HOURS desde o login (auth_time).
  function issueRefreshToken(user, authTime, sessionId) {
    return jwt.sign({ sub: user.id, typ: 'refresh', auth_time: authTime, sid: sessionId }, refreshTokenSecret, {
      expiresIn: sessionIdleMinutes * 60,
    });
  }

  async function login(credentials = {}, { userAgent } = {}) {
    const email = typeof credentials.email === 'string'
      ? credentials.email.trim().toLowerCase()
      : '';
    const password = credentials.password;

    if (!email || typeof password !== 'string' || password.length === 0) {
      throw new AppError(422, 'VALIDACAO_INVALIDA', 'Informe e-mail e senha.', [
        ...(!email ? [{ field: 'email', message: 'Informe um e-mail válido.' }] : []),
        ...(typeof password !== 'string' || password.length === 0
          ? [{ field: 'password', message: 'Informe a senha.' }]
          : []),
      ]);
    }

    const lock = throttle.check(email);
    if (lock.locked) {
      const minutes = Math.ceil(lock.retryAfterMs / 60000);
      throw new AppError(429, 'LOGIN_BLOQUEADO', `Muitas tentativas sem sucesso. Tente novamente em ${minutes} minuto(s).`);
    }

    const user = await repository.findByEmail(email);
    const passwordHash = user?.senha_hash || DUMMY_PASSWORD_HASH;
    const passwordMatches = await comparePassword(password, passwordHash);

    if (!user || !user.ativo || !passwordMatches || getPermissionsForRole(user.cargo).length === 0) {
      throttle.registerFailure(email);
      throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
    }

    throttle.registerSuccess(email);
    const authTime = Math.floor(now() / 1000);
    const sessionId = await sessions.create({
      usuarioId: user.id,
      agenteUsuario: userAgent?.slice(0, 500),
      expiraEm: new Date((authTime + sessionMaxHours * 3600) * 1000),
    });

    return {
      token: issueAccessToken(user, sessionId),
      refreshToken: issueRefreshToken(user, authTime, sessionId),
      user: serializeUser(user),
    };
  }

  async function refresh(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken || '', refreshTokenSecret);
    } catch (error) {
      throw expiredSession();
    }

    // Tokens sem sid (emitidos antes das sessões no banco) exigem novo login.
    if (payload.typ !== 'refresh' || !Number.isInteger(payload.auth_time) || typeof payload.sid !== 'string') {
      throw expiredSession();
    }
    if (Math.floor(now() / 1000) - payload.auth_time > sessionMaxHours * 3600) throw expiredSession();

    const session = await sessions.findActive(payload.sid);
    if (!session || session.usuario_id !== payload.sub) throw expiredSession();

    const user = await repository.findById(payload.sub);
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    await sessions.touch(session.id);
    return {
      token: issueAccessToken(user, session.id),
      refreshToken: issueRefreshToken(user, payload.auth_time, session.id),
      user: serializeUser(user),
    };
  }

  // Encerra a sessão do cookie no banco. Cookie inválido ou expirado não é erro: o logout sempre conclui.
  async function logout(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken || '', refreshTokenSecret, { ignoreExpiration: true });
    } catch (error) {
      return;
    }
    if (payload.typ === 'refresh' && typeof payload.sid === 'string') await sessions.revoke(payload.sid);
  }

  async function getCurrentUser(id) {
    const user = await repository.findById(id);
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    return serializeUser(user);
  }

  async function changeOwnPassword(userId, { senha_atual: senhaAtual, nova_senha: novaSenha }, { sessionId } = {}) {
    const user = await repository.findByIdWithPassword(userId);
    if (!user || !user.ativo) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    if (!(await comparePassword(senhaAtual, user.senha_hash))) {
      throw new AppError(422, 'SENHA_ATUAL_INCORRETA', 'A senha atual está incorreta.', [
        { field: 'senha_atual', message: 'A senha atual está incorreta.' },
      ]);
    }

    const problems = getPasswordProblems(novaSenha);
    if (senhaAtual === novaSenha) problems.push('Escolha uma senha diferente da atual.');
    if (problems.length > 0) throw weakPassword(problems, 'nova_senha');

    await repository.updatePassword(userId, await hashPassword(novaSenha));
    // Outros dispositivos saem; a sessão atual continua.
    await sessions.revokeAllForUser(userId, { exceptId: sessionId || null });
  }

  // "Esqueci minha senha": a resposta é sempre a mesma (não revela se o e-mail existe) e o e-mail
  // sai em segundo plano, para o tempo de resposta também não revelar.
  async function requestPasswordReset({ email } = {}) {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = normalized ? await repository.findByEmail(normalized) : null;
    if (user && user.ativo && getPermissionsForRole(user.cargo).length > 0) {
      accessLinks.send(user, 'redefinicao').then((result) => {
        if (!result.enviado) log.error('email_redefinicao_nao_enviado', { module: 'auth', entityId: user.id });
      }).catch((error) => {
        log.error('email_redefinicao_falhou', { module: 'auth', entityId: user.id, code: error.code });
      });
    }
  }

  // Define a senha pelo link de redefinição ou de convite: uso único, e todas as sessões do usuário caem.
  async function resetPassword({ token, nova_senha: novaSenha } = {}) {
    const problems = getPasswordProblems(novaSenha);
    if (problems.length > 0) throw weakPassword(problems, 'nova_senha');
    const senhaHash = await hashPassword(novaSenha);

    return transaction(async (db) => {
      const link = await accessLinks.consume(db, token);
      if (!link) {
        throw new AppError(400, 'LINK_INVALIDO', 'Este link é inválido ou já expirou. Peça um novo link.');
      }
      await repository.updatePassword(link.usuario_id, senhaHash, db);
      await sessions.revokeAllForUser(link.usuario_id, { db });
      return { email: link.email, finalidade: link.finalidade, usuarioId: link.usuario_id };
    });
  }

  return { login, refresh, logout, getCurrentUser, changeOwnPassword, requestPasswordReset, resetPassword };
}

module.exports = { ...createAuthService(), createAuthService, serializeUser };
