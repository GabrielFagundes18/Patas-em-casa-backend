const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../../utils/app-error');
const { getPermissionsForRole } = require('../../config/permissions');
const { readConfig } = require('../../config/env');
const { signToken } = require('../../middleware/auth');
const { getPasswordProblems } = require('../../utils/password-policy');
const userRepository = require('../../repositories/auth/user-repository');
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

function createAuthService({
  repository = userRepository,
  comparePassword = bcrypt.compare,
  hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  throttle = loginThrottle,
  now = () => Date.now(),
} = {}) {
  function issueAccessToken(user) {
    return signToken({ sub: user.id, email: user.email, role: user.cargo, nome: user.nome });
  }

  // Token de renovação: vale por SESSION_IDLE_MINUTES a partir do último uso (inatividade)
  // e nunca além de SESSION_MAX_HOURS desde o login (auth_time).
  function issueRefreshToken(user, authTime) {
    return jwt.sign({ sub: user.id, typ: 'refresh', auth_time: authTime }, refreshTokenSecret, {
      expiresIn: sessionIdleMinutes * 60,
    });
  }

  async function login(credentials = {}) {
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

    return {
      token: issueAccessToken(user),
      refreshToken: issueRefreshToken(user, authTime),
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

    if (payload.typ !== 'refresh' || !Number.isInteger(payload.auth_time)) throw expiredSession();
    if (Math.floor(now() / 1000) - payload.auth_time > sessionMaxHours * 3600) throw expiredSession();

    const user = await repository.findById(payload.sub);
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    return {
      token: issueAccessToken(user),
      refreshToken: issueRefreshToken(user, payload.auth_time),
      user: serializeUser(user),
    };
  }

  async function getCurrentUser(id) {
    const user = await repository.findById(id);
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    return serializeUser(user);
  }

  async function changeOwnPassword(userId, { senha_atual: senhaAtual, nova_senha: novaSenha }) {
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
    if (problems.length > 0) {
      throw new AppError(422, 'SENHA_FRACA', 'A nova senha não atende à política de senha.', problems.map((message) => ({ field: 'nova_senha', message })));
    }

    await repository.updatePassword(userId, await hashPassword(novaSenha));
  }

  return { login, refresh, getCurrentUser, changeOwnPassword };
}

module.exports = { ...createAuthService(), createAuthService, serializeUser };
