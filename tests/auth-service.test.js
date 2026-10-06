const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { readConfig } = require('../src/config/env');
const AppError = require('../src/utils/app-error');
const { createAuthService } = require('../src/services/auth/auth-service');
const { createFakeSessions } = require('./helpers/fake-sessions');

const activeAdmin = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  nome: 'Admin de teste',
  email: 'admin@example.org',
  senha_hash: 'stored-hash',
  cargo: 'administrador',
  ativo: true,
};

test('login reads the user from the repository and returns a short-lived safe user', async () => {
  const service = createAuthService({
    repository: {
      findByEmail: async (email) => (email === activeAdmin.email ? activeAdmin : null),
      findById: async (id) => (id === activeAdmin.id ? activeAdmin : null),
    },
    comparePassword: async (password, passwordHash) => (
      password === 'correct password' && passwordHash === activeAdmin.senha_hash
    ),
    sessions: createFakeSessions(),
  });

  const result = await service.login({ email: ' ADMIN@example.org ', password: 'correct password' });
  const token = jwt.verify(result.token, readConfig().jwtSecret);

  assert.equal(token.sub, activeAdmin.id);
  assert.ok(token.exp - token.iat <= 15 * 60);
  assert.equal(result.user.cargo, 'administrador');
  assert.ok(result.user.permissions.includes('team:update'));
  assert.ok(result.refreshToken);
  assert.equal(Object.hasOwn(result.user, 'senha_hash'), false);
});

test('login gives the same invalid-credentials error for missing users and wrong passwords', async () => {
  const service = createAuthService({
    repository: { findByEmail: async () => null },
    comparePassword: async () => false,
  });

  await assert.rejects(service.login({ email: 'unknown@example.org', password: 'wrong' }), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'CREDENCIAIS_INVALIDAS');
    return true;
  });
});

test('inactive users cannot authenticate even with a matching password', async () => {
  const service = createAuthService({
    repository: { findByEmail: async () => ({ ...activeAdmin, ativo: false }) },
    comparePassword: async () => true,
  });

  await assert.rejects(service.login({ email: activeAdmin.email, password: 'correct password' }), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'CREDENCIAIS_INVALIDAS');
    return true;
  });
});

test('current user lookup revokes access to a disabled account', async () => {
  const service = createAuthService({
    repository: { findById: async () => ({ ...activeAdmin, ativo: false }) },
  });

  await assert.rejects(service.getCurrentUser(activeAdmin.id), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'SESSAO_INVALIDA');
    return true;
  });
});