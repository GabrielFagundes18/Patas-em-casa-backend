/*
 * ============================================================================
 * ARQUIVO: shared.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES das peças COMPARTILHADAS do backend: formato das respostas,
 *   paginação, validate-request, configuração (env), matriz de permissões,
 *   segredo JWT de desenvolvimento, middlewares de autenticação/permissão e a
 *   documentação gerada (docs/permissoes.md).
 *
 * PRINCIPAIS ITENS:
 *   - 11 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/utils (app-error, http-response, pagination), src/middleware (validate-request, auth),
 *     src/config (env, permissions), scripts/gerar-doc-permissoes.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Itens testados.
const AppError = require('../../src/utils/app-error');
const { errorResponse, listResponse, successResponse } = require('../../src/utils/http-response');
const { MAX_PAGE_SIZE, parsePagination } = require('../../src/utils/pagination');
const validateRequest = require('../../src/middleware/validate-request');
const { readConfig } = require('../../src/config/env');
const { getPermissionsForRole, hasPermission } = require('../../src/config/permissions');
// JWT (para verificar tokens gerados).
const jwt = require('jsonwebtoken');
const { requireAuth, requirePermission, signToken } = require('../../src/middleware/auth');

// Teste 1: envelope de sucesso { data, meta }.
test('success responses use the common data and meta envelope', () => {
  // deepEqual compara objetos campo a campo (não a "referência").
  assert.deepEqual(successResponse({ id: 'a1' }), { data: { id: 'a1' }, meta: {} });
});

// Teste 2: lista paginada calcula totalPages (21 itens, 20 por página → 2 páginas).
test('paginated responses include total pages', () => {
  assert.deepEqual(listResponse([{ id: 'a1' }], 21, 2, 20), {
    data: [{ id: 'a1' }],
    meta: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
  });
});

// Teste 3: valores padrão e limite máximo do tamanho da página.
test('pagination applies defaults and caps page size', () => {
  assert.deepEqual(parsePagination({ pageSize: MAX_PAGE_SIZE + 10 }), {
    page: 1,
    pageSize: MAX_PAGE_SIZE,
    offset: 0,
  });
});

// Teste 4: página inválida → AppError 400 com detalhe no campo "page".
test('invalid pagination returns a field-specific application error', () => {
  assert.throws(() => parsePagination({ page: '0' }), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 400);
    assert.equal(error.details[0].field, 'page');
    return true;
  });
});

// Teste 5: validate-request transforma os detalhes do validador num AppError 422 (via next).
test('request validation forwards field details as an application error', () => {
  const middleware = validateRequest(({ body }) => (
    body.nome ? [] : [{ field: 'nome', message: 'Informe o nome.' }]
  ));
  let receivedError;

  // Chama o middleware com req/res "de mentira" e um next que guarda o erro recebido.
  middleware({ body: {}, params: {}, query: {} }, {}, (error) => {
    receivedError = error;
  });

  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.status, 422);
  assert.equal(receivedError.details[0].field, 'nome');
});

// Teste 6: envelope de erro { error: { code, message, details } }.
test('error responses use the common error envelope', () => {
  assert.deepEqual(errorResponse('NAO_ENCONTRADO', 'Registro não encontrado.'), {
    error: {
      code: 'NAO_ENCONTRADO',
      message: 'Registro não encontrado.',
      details: [],
    },
  });
});

// Teste 7: readConfig recusa origem inválida e segredo curto em produção (a mensagem cita a variável).
test('environment configuration rejects invalid origins and unsafe production secrets', () => {
  assert.throws(() => readConfig({ CORS_ORIGIN: 'not-an-origin' }), /CORS_ORIGIN/);
  assert.throws(() => readConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://db',
    CORS_ORIGIN: 'https://patas.example',
    JWT_SECRET: 'short',
  }), /JWT_SECRET/);
});

// Teste 8: a matriz de permissões responde como esperado para vários cargos.
test('permission checks use the central role matrix', () => {
  assert.equal(hasPermission('administrador', 'animals:update'), true);
  assert.equal(hasPermission('gestor_animais', 'animals:delete'), false);
  assert.equal(hasPermission('financeiro', 'lgpd:approve'), false);
  assert.equal(hasPermission('voluntariado', 'donations:write'), false);
  // Gestor da ONG: toda a operação, menos equipe/acessos e decisões LGPD.
  assert.equal(hasPermission('gestor_ong', 'animals:delete'), true);
  assert.equal(hasPermission('gestor_ong', 'adoptions:approve'), true);
  assert.equal(hasPermission('gestor_ong', 'donations:update'), true);
  assert.equal(hasPermission('gestor_ong', 'stories:delete'), true);
  assert.equal(hasPermission('gestor_ong', 'team:read'), false);
  assert.equal(hasPermission('gestor_ong', 'lgpd:approve'), false);
  // Cargo desconhecido não tem nenhuma permissão.
  assert.equal(hasPermission('cargo_inexistente', 'animals:read'), false);
  assert.deepEqual(getPermissionsForRole('cargo_inexistente'), []);
});

// Teste 9: fora de produção, o segredo JWT é gerado automaticamente (64 caracteres hex) e funciona.
test('development JWT secret is generated at runtime and signs verifiable tokens', () => {
  const token = signToken({ sub: 'test-user' });
  assert.equal(jwt.verify(token, readConfig().jwtSecret).sub, 'test-user');
  assert.equal(readConfig({ NODE_ENV: 'development' }).jwtSecret.length, 64);
  assert.equal(readConfig({ NODE_ENV: 'test' }).jwtSecret.length, 64);
});

// Teste 10: sem token → 401; cargo sem permissão → 403.
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
// Teste 11: docs/permissoes.md precisa estar igual ao que o gerador produz hoje.
test('docs/permissoes.md reflects the permission matrix in the code', () => {
  const fs = require('node:fs');
  const { buildDocument, target } = require('../../scripts/gerar-doc-permissoes');
  assert.equal(fs.readFileSync(target, 'utf8'), buildDocument(), 'Rode "npm run docs:permissoes" após mudar a matriz.');
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste chama uma peça compartilhada com entradas conhecidas e compara o
 *   resultado com o esperado. Middlewares são testados chamando-os diretamente
 *   com objetos simples no lugar de req/res e um "next" que captura o erro.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - assert.equal x assert.deepEqual; assert.throws com regex na mensagem.
 *   - Testar middlewares sem subir servidor.
 *   - Teste que garante que a documentação gerada está atualizada.
 * ============================================================================
 */
