const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../../src/app');
const { tokenFor, useFakeUsers } = require('../helpers/fake-users');

const SOME_ID = '550e8400-e29b-41d4-a716-446655440000';
let restoreUsers;
let server;
let baseUrl;

test.before(() => {
  restoreUsers = useFakeUsers();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  restoreUsers();
  return new Promise((resolve) => server.close(resolve));
});

function call(method, path, { role, body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(role ? { Authorization: `Bearer ${tokenFor(role)}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('each role only reaches the modules of its permission matrix', async () => {
  const forbidden = [
    ['voluntariado', 'GET', '/api/v1/donations'],
    ['voluntariado', 'GET', '/api/v1/adoption-requests'],
    ['voluntariado', 'GET', '/api/v1/users'],
    ['financeiro', 'GET', '/api/v1/animals'],
    ['financeiro', 'POST', `/api/v1/adoption-requests/${SOME_ID}/approve`],
    ['gestor_animais', 'DELETE', `/api/v1/animals/${SOME_ID}`],
    ['gestor_animais', 'GET', '/api/v1/donations/export'],
    ['gestor_animais', 'POST', `/api/v1/adopters/${SOME_ID}/anonymize`],
    ['financeiro', 'GET', `/api/v1/adopters/${SOME_ID}/lgpd-export`],
    ['gestor_animais', 'GET', '/api/v1/permissions'],
  ];

  for (const [role, method, path] of forbidden) {
    const response = await call(method, path, { role, body: method === 'GET' ? undefined : {} });
    assert.equal(response.status, 403, `${role} ${method} ${path}`);
    assert.equal((await response.json()).error.code, 'SEM_PERMISSAO');
  }
});

test('protected modules require a session', async () => {
  for (const path of ['/api/v1/dashboard/summary', '/api/v1/adopters', '/api/v1/stories', '/api/v1/volunteers', '/api/v1/users']) {
    const response = await call('GET', path);
    assert.equal(response.status, 401, path);
  }
});

test('decisions and irreversible LGPD actions validate their confirmation before any change', async () => {
  const approve = await call('POST', `/api/v1/adoption-requests/${SOME_ID}/approve`, { role: 'administrador', body: {} });
  assert.equal(approve.status, 422);
  assert.equal((await approve.json()).error.details[0].field, 'justificativa');

  const anonymize = await call('POST', `/api/v1/adopters/${SOME_ID}/anonymize`, { role: 'administrador', body: { confirmacao: 'sim' } });
  assert.equal(anonymize.status, 422);
  assert.match((await anonymize.json()).error.details[0].message, /ANONIMIZAR/);

  const move = await call('PATCH', `/api/v1/adoption-requests/${SOME_ID}`, { role: 'gestor_animais', body: { status: 'aprovado' } });
  assert.equal(move.status, 422);
});

test('the permission matrix is available to administrators', async () => {
  const response = await call('GET', '/api/v1/permissions', { role: 'administrador' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.data.modules.some((module) => module.module === 'animals' && module.actions.includes('export')));
  assert.deepEqual(body.data.roles.map((role) => role.role), ['administrador', 'gestor_ong', 'gestor_animais', 'financeiro', 'voluntariado']);
});

test('session refresh requires the anti-CSRF header and a valid cookie', async () => {
  const withoutHeader = await call('POST', '/api/v1/auth/refresh');
  assert.equal(withoutHeader.status, 403);
  assert.equal((await withoutHeader.json()).error.code, 'CSRF_INVALIDO');

  const withoutCookie = await call('POST', '/api/v1/auth/refresh', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  assert.equal(withoutCookie.status, 401);
  assert.equal((await withoutCookie.json()).error.code, 'SESSAO_EXPIRADA');
  assert.match(withoutCookie.headers.get('set-cookie'), /patas_refresh=; Max-Age=0; Path=\/api\/v1\/auth; HttpOnly; SameSite=Strict/);

  const logout = await call('POST', '/api/v1/auth/logout', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  assert.equal(logout.status, 204);
});

test('API responses are not cacheable and do not reveal the framework', async () => {
  const response = await call('GET', '/api/v1/me');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('public endpoints validate input without requiring login', async () => {
  const animals = await call('GET', '/api/v1/public/animals?especie=dinossauro');
  assert.equal(animals.status, 422);

  const volunteer = await call('POST', '/api/v1/public/volunteers', {
    body: { nome: 'Robô', email: 'robo@example.org', telefone: '(11) 98888-7777', areas: ['passeios'], website: 'http://spam' },
  });
  assert.equal(volunteer.status, 422);
  assert.ok((await volunteer.json()).error.details.some((detail) => detail.field === 'website'));
});
