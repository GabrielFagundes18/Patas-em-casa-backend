const assert = require('node:assert/strict');
const test = require('node:test');
const app = require('../../src/app');
const { tokenFor, useFakeUsers } = require('../helpers/fake-users');

let restoreUsers;
test.before(() => {
  restoreUsers = useFakeUsers();
});
test.after(() => restoreUsers());

test('HTTP errors include a request id and security headers', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/rota-inexistente`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(body.error, {
    code: 'ROTA_NAO_ENCONTRADA',
    message: 'A rota solicitada não foi encontrada.',
    details: [],
  });
});

test('malformed JSON returns a safe validation error', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid json',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'JSON_INVALIDO');
  assert.equal(body.error.details.length, 0);
});

test('protected routes return the common unauthenticated error', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body.error, {
    code: 'NAO_AUTENTICADO',
    message: 'Sessão expirada ou não autenticada.',
    details: [],
  });
});

test('versioned login validates required fields using the common error contract', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, 'VALIDACAO_INVALIDA');
  assert.deepEqual(body.error.details.map((detail) => detail.field), ['email', 'password']);
});

test('versioned current-user endpoint requires a bearer token', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'NAO_AUTENTICADO');
});

test('animal writes require RBAC and validate payload before database access', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const administratorToken = tokenFor('administrador');
  const animalManagerToken = tokenFor('gestor_animais');

  const invalidCreate = await fetch(`${baseUrl}/api/v1/animals`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${administratorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const invalidBody = await invalidCreate.json();
  assert.equal(invalidCreate.status, 422);
  assert.equal(invalidBody.error.code, 'VALIDACAO_INVALIDA');

  const forbiddenDelete = await fetch(`${baseUrl}/api/v1/animals/550e8400-e29b-41d4-a716-446655440000`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${animalManagerToken}` },
  });
  const forbiddenBody = await forbiddenDelete.json();
  assert.equal(forbiddenDelete.status, 403);
  assert.equal(forbiddenBody.error.code, 'SEM_PERMISSAO');
});

test('versioned animal listing requires an authenticated user', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/animals`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'NAO_AUTENTICADO');
});
test('volunteer routes require authentication and volunteer permissions', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const financeToken = tokenFor('financeiro');

  const anonymousList = await fetch(`${baseUrl}/api/v1/volunteers`);
  assert.equal(anonymousList.status, 401);

  const anonymousDelete = await fetch(`${baseUrl}/api/v1/volunteers/550e8400-e29b-41d4-a716-446655440000`, { method: 'DELETE' });
  assert.equal(anonymousDelete.status, 401);

  const forbiddenList = await fetch(`${baseUrl}/api/v1/volunteers`, {
    headers: { Authorization: `Bearer ${financeToken}` },
  });
  assert.equal(forbiddenList.status, 403);
});

test('legacy and mock routes were removed in favour of /api/v1', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const [method, path] of [
    ['POST', '/api/admin/login'],
    ['GET', '/api/animals'],
    ['GET', '/api/public/animais'],
    ['GET', '/animais/BuscaTodoAnimais'],
    ['GET', '/voluntarios/BuscarVoluntarios'],
    ['GET', '/pedidos_steps/BuscarPedidosSteps'],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
  }
});

test('animal status endpoint only forwards the status field', async (context) => {
  const animalService = require('../../src/modules/animals/animal-service');
  const originalChangeStatus = animalService.changeStatus;
  let receivedChanges;
  animalService.changeStatus = async (id, changes) => {
    receivedChanges = changes;
    return { id, ...changes };
  };
  const server = app.listen(0);
  context.after(() => {
    animalService.changeStatus = originalChangeStatus;
    return new Promise((resolve) => server.close(resolve));
  });
  const token = tokenFor('gestor_animais');

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/v1/animals/550e8400-e29b-41d4-a716-446655440000/status`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'adotado', nome: 'Outro nome' }),
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedChanges, { status: 'adotado', motivo: undefined });
});

test('public adoption request validates the form before touching the database', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/public/adoption-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Ana' }),
  });
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, 'VALIDACAO_INVALIDA');
  assert.ok(body.error.details.some((detail) => detail.field === 'animal_id'));
});

test('authorization uses the current role and status from the database, not the token claims', async (context) => {
  const animalService = require('../../src/modules/animals/animal-service');
  const originalList = animalService.list;
  animalService.list = async () => ({ items: [], total: 0 });
  const server = app.listen(0);
  context.after(() => {
    animalService.list = originalList;
    return new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Token emitido quando o usuário era "financeiro"; no banco ele já é gestor de animais.
  const staleRole = await fetch(`${baseUrl}/api/v1/animals`, {
    headers: { Authorization: `Bearer ${tokenFor('gestor_animais', { role: 'financeiro' })}` },
  });
  assert.equal(staleRole.status, 200);

  // Token que se diz administrador, mas o usuário real é voluntário.
  const forgedRole = await fetch(`${baseUrl}/api/v1/animals/550e8400-e29b-41d4-a716-446655440000`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenFor('voluntariado', { role: 'administrador' })}` },
  });
  assert.equal(forgedRole.status, 403);

  const deactivated = await fetch(`${baseUrl}/api/v1/animals`, {
    headers: { Authorization: `Bearer ${tokenFor('inativo')}` },
  });
  assert.equal(deactivated.status, 401);
  assert.equal((await deactivated.json()).error.code, 'SESSAO_INVALIDA');
});
