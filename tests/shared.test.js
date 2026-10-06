const assert = require('node:assert/strict');
const test = require('node:test');
const AppError = require('../src/utils/app-error');
const { errorResponse, listResponse, successResponse } = require('../src/utils/http-response');
const { MAX_PAGE_SIZE, parsePagination } = require('../src/utils/pagination');
const validateRequest = require('../src/middleware/validate-request');
const { readConfig } = require('../src/config/env');
const { getPermissionsForRole, hasPermission } = require('../src/config/permissions');
const jwt = require('jsonwebtoken');
const { requireAuth, requirePermission, signToken } = require('../src/middleware/auth');

test('success responses use the common data and meta envelope', () => {
  assert.deepEqual(successResponse({ id: 'a1' }), { data: { id: 'a1' }, meta: {} });
});

test('paginated responses include total pages', () => {
  assert.deepEqual(listResponse([{ id: 'a1' }], 21, 2, 20), {
    data: [{ id: 'a1' }],
    meta: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
  });
});

test('pagination applies defaults and caps page size', () => {
  assert.deepEqual(parsePagination({ pageSize: MAX_PAGE_SIZE + 10 }), {
    page: 1,
    pageSize: MAX_PAGE_SIZE,
    offset: 0,
  });
});

test('invalid pagination returns a field-specific application error', () => {
  assert.throws(() => parsePagination({ page: '0' }), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 400);
    assert.equal(error.details[0].field, 'page');
    return true;
  });
});

test('request validation forwards field details as an application error', () => {
  const middleware = validateRequest(({ body }) => (
    body.nome ? [] : [{ field: 'nome', message: 'Informe o nome.' }]
  ));
  let receivedError;

  middleware({ body: {}, params: {}, query: {} }, {}, (error) => {
    receivedError = error;
  });

  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.status, 422);
  assert.equal(receivedError.details[0].field, 'nome');
});

test('error responses use the common error envelope', () => {
  assert.deepEqual(errorResponse('NAO_ENCONTRADO', 'Registro não encontrado.'), {
    error: {
      code: 'NAO_ENCONTRADO',
      message: 'Registro não encontrado.',
      details: [],
    },
  });
});

test('environment configuration rejects invalid origins and unsafe production secrets', () => {
  assert.throws(() => readConfig({ CORS_ORIGIN: 'not-an-origin' }), /CORS_ORIGIN/);
  assert.throws(() => readConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://db',
    CORS_ORIGIN: 'https://patas.example',
    JWT_SECRET: 'short',
  }), /JWT_SECRET/);
});

test('permission checks use the central role matrix', () => {
  assert.equal(hasPermission('administrador', 'animals:update'), true);
  assert.equal(hasPermission('gestor_animais', 'animals:delete'), false);
  assert.equal(hasPermission('financeiro', 'lgpd:approve'), false);
  assert.equal(hasPermission('voluntariado', 'donations:write'), false);
  assert.equal(hasPermission('cargo_inexistente', 'animals:read'), false);
  assert.deepEqual(getPermissionsForRole('cargo_inexistente'), []);
});

test('development JWT secret is generated at runtime and signs verifiable tokens', () => {
  const token = signToken({ sub: 'test-user' });
  assert.equal(jwt.verify(token, readConfig().jwtSecret).sub, 'test-user');
  assert.equal(readConfig({ NODE_ENV: 'development' }).jwtSecret.length, 64);
  assert.equal(readConfig({ NODE_ENV: 'test' }).jwtSecret.length, 64);
});

test('authentication and permission middleware return application errors', () => {
  let authenticationError;
  requireAuth({ headers: {} }, {}, (error) => {
    authenticationError = error;
  });
  assert.equal(authenticationError.status, 401);

  let permissionError;
  requirePermission('donations:read')({ user: { role: 'voluntariado' } }, {}, (error) => {
    permissionError = error;
  });
  assert.equal(permissionError.status, 403);

});
test('docs/permissoes.md reflects the permission matrix in the code', () => {
  const fs = require('node:fs');
  const { buildDocument, target } = require('../scripts/gerar-doc-permissoes');
  assert.equal(fs.readFileSync(target, 'utf8'), buildDocument(), 'Rode "npm run docs:permissoes" após mudar a matriz.');
});
