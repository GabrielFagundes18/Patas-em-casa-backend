/*
 * ============================================================================
 * ARQUIVO: http-foundation.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES da BASE HTTP da API, subindo a aplicação real numa porta livre:
 *   formato padrão dos erros (404, 400 JSON inválido, 401, 422), cabeçalhos de
 *   segurança e id da requisição, permissões nas rotas de animais e
 *   voluntários, remoção das rotas antigas, rota de status repassando só os
 *   campos certos, validação do formulário público e autorização baseada no
 *   banco (e não no que o token diz).
 *
 * PRINCIPAIS ITENS:
 *   - test.before/test.after: liga/desliga os usuários falsos.
 *   - 12 testes (cada um sobe e derruba seu próprio servidor).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/app.js, tests/helpers/fake-users.js e src/modules/animals/animal-service.js
 *     (substituído temporariamente em dois testes).
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Aplicação completa.
const app = require('../../src/app');
// Usuários e tokens de teste.
const { tokenFor, useFakeUsers } = require('../helpers/fake-users');

// Liga os usuários falsos antes de todos os testes e restaura depois.
let restoreUsers;
test.before(() => {
  restoreUsers = useFakeUsers();
});
test.after(() => restoreUsers());

// Teste 1: rota inexistente → 404 padronizado, com X-Request-Id (UUID) e cabeçalhos de segurança.
// "context.after" agenda o fechamento do servidor para o fim DESTE teste.
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

// Teste 2: JSON malformado no corpo → 400 JSON_INVALIDO sem detalhes internos.
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

// Teste 3: rota protegida sem token → 401 no formato padrão.
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

// Teste 4: login sem campos → 422 com detalhes para "email" e "password".
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

// Teste 5: /me exige token "Bearer".
test('versioned current-user endpoint requires a bearer token', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'NAO_AUTENTICADO');
});

// Teste 6: cadastrar animal vazio (administrador) → 422 antes de ir ao banco; gestor excluindo → 403.
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

// Teste 7: lista de animais do painel exige login.
test('versioned animal listing requires an authenticated user', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/animals`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'NAO_AUTENTICADO');
});
// Teste 8: voluntários — sem login 401 (listar e excluir); financeiro (sem permissão) 403.
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

// Teste 9: rotas antigas (fora de /api/v1) não existem mais → 404.
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

// Teste 10: PATCH /status repassa ao service só status e motivo (o "nome" enviado junto é ignorado).
// O service é substituído temporariamente por uma versão que só registra o que recebeu.
test('animal status endpoint only forwards the status field', async (context) => {
  const animalService = require('../../src/modules/animals/animal-service');
  const originalChangeStatus = animalService.changeStatus;
  let receivedChanges;
  animalService.changeStatus = async (id, changes) => {
    receivedChanges = changes;
    return { id, ...changes };
  };
  const server = app.listen(0);
  // No fim: restaura a função original e fecha o servidor.
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

// Teste 11: formulário público incompleto → 422 (inclui o campo animal_id) antes de tocar no banco.
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

// Teste 12: o cargo e a situação vêm do "banco", não do token — mesmo que o token diga outra coisa.
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

  // Usuário desativado no banco → 401 SESSAO_INVALIDA.
  const deactivated = await fetch(`${baseUrl}/api/v1/animals`, {
    headers: { Authorization: `Bearer ${tokenFor('inativo')}` },
  });
  assert.equal(deactivated.status, 401);
  assert.equal((await deactivated.json()).error.code, 'SESSAO_INVALIDA');
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste sobe a API numa porta livre, faz requisições com fetch (às vezes
 *   com um service substituído temporariamente) e confere status, cabeçalhos e
 *   o corpo do erro; context.after fecha o servidor e restaura o que foi trocado.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Contrato de erros da API e cabeçalhos de segurança.
 *   - context.after (limpeza por teste) x test.after (limpeza global).
 *   - Substituir funções de módulos em testes e restaurá-las.
 *   - Não confiar em "claims" do token para autorização.
 * ============================================================================
 */
