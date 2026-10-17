/*
 * ============================================================================
 * ARQUIVO: http-permissions.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES de PERMISSÕES e SEGURANÇA pela camada HTTP: sobe a aplicação de
 *   verdade numa porta livre e faz requisições com fetch, usando tokens dos
 *   usuários de teste. Confere que cada cargo só acessa o que pode, que rotas
 *   protegidas exigem login, que ações de decisão/LGPD validam a confirmação,
 *   a proteção anti-CSRF do refresh, cabeçalhos de segurança e validação das
 *   rotas públicas.
 *
 * PRINCIPAIS ITENS:
 *   - SOME_ID: um UUID qualquer.
 *   - test.before / test.after: sobem e derrubam o servidor.
 *   - call(method, path, { role, body, headers }): faz uma requisição.
 *   - 7 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/app.js (a aplicação) e tests/helpers/fake-users.js.
 *
 * OBSERVAÇÃO (para estudo):
 *   O teste "session refresh..." espera um cookie SEM o atributo "Secure". O
 *   auth-controller liga o Secure quando NODE_ENV=production; por isso, se o .env
 *   local estiver com NODE_ENV=production, este teste falha (o resultado depende
 *   do ambiente em que os testes rodam).
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// A aplicação Express completa.
const app = require('../../src/app');
// Usuários e tokens de teste.
const { tokenFor, useFakeUsers } = require('../helpers/fake-users');

// Id qualquer (formato UUID válido) para rotas com :id.
const SOME_ID = '550e8400-e29b-41d4-a716-446655440000';
// Preenchidos no test.before.
let restoreUsers;
let server;
let baseUrl;

// Antes de todos os testes: usuários falsos e servidor numa porta livre (listen(0) = o sistema escolhe).
test.before(() => {
  restoreUsers = useFakeUsers();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

// Depois de todos: restaura o repository e fecha o servidor (a Promise espera o fechamento).
test.after(() => {
  restoreUsers();
  return new Promise((resolve) => server.close(resolve));
});

/*
 * FUNÇÃO: call
 * O que faz: faz uma requisição HTTP à aplicação de teste.
 * Parâmetros: method, path e { role (cargo do token), body (objeto → JSON), headers extras }.
 * Retorno: a Promise do fetch (Response).
 */
function call(method, path, { role, body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      // Token só se um cargo foi informado.
      ...(role ? { Authorization: `Bearer ${tokenFor(role)}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Teste 1: tabela de acessos proibidos — cada combinação precisa responder 403 SEM_PERMISSAO.
test('each role only reaches the modules of its permission matrix', async () => {
  // [cargo, método, caminho].
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
    // O 3º argumento é a mensagem mostrada se a verificação falhar (ajuda a achar o caso).
    assert.equal(response.status, 403, `${role} ${method} ${path}`);
    assert.equal((await response.json()).error.code, 'SEM_PERMISSAO');
  }
});

// Teste 2: sem token → 401 nas rotas protegidas.
test('protected modules require a session', async () => {
  for (const path of ['/api/v1/dashboard/summary', '/api/v1/adopters', '/api/v1/stories', '/api/v1/volunteers', '/api/v1/users']) {
    const response = await call('GET', path);
    assert.equal(response.status, 401, path);
  }
});

// Teste 3: aprovar sem justificativa, anonimizar com confirmação errada e mover para "aprovado" pelo PATCH → 422.
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

// Teste 4: o administrador recebe a matriz completa (módulos e cargos na ordem certa).
test('the permission matrix is available to administrators', async () => {
  const response = await call('GET', '/api/v1/permissions', { role: 'administrador' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.data.modules.some((module) => module.module === 'animals' && module.actions.includes('export')));
  assert.deepEqual(body.data.roles.map((role) => role.role), ['administrador', 'gestor_ong', 'gestor_animais', 'financeiro', 'voluntariado']);
});

// Teste 5: refresh sem o cabeçalho anti-CSRF → 403; com cabeçalho e sem cookie → 401 e cookie apagado;
// logout sempre conclui (204). (Veja a observação no topo sobre o atributo Secure.)
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

// Teste 6: respostas da API sem cache e sem o cabeçalho X-Powered-By.
test('API responses are not cacheable and do not reveal the framework', async () => {
  const response = await call('GET', '/api/v1/me');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
});

// Teste 7: rotas públicas validam sem login — filtro inválido → 422; honeypot preenchido → 422 no campo "website".
test('public endpoints validate input without requiring login', async () => {
  const animals = await call('GET', '/api/v1/public/animals?especie=dinossauro');
  assert.equal(animals.status, 422);

  const volunteer = await call('POST', '/api/v1/public/volunteers', {
    body: { nome: 'Robô', email: 'robo@example.org', telefone: '(11) 98888-7777', areas: ['passeios'], website: 'http://spam' },
  });
  assert.equal(volunteer.status, 422);
  assert.ok((await volunteer.json()).error.details.some((detail) => detail.field === 'website'));
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   test.before sobe a API numa porta livre com usuários falsos; cada teste faz
 *   requisições reais (fetch) e confere status, códigos de erro e cabeçalhos;
 *   test.after desliga tudo.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testes HTTP "de ponta a ponta" sem banco (camadas reais + dados falsos).
 *   - Ganchos test.before/test.after.
 *   - Porta 0 (porta livre escolhida pelo sistema).
 *   - Testes que dependem do ambiente (variáveis do .env) e como isso pode quebrá-los.
 * ============================================================================
 */
