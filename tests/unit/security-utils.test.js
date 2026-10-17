/*
 * ============================================================================
 * ARQUIVO: security-utils.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES das peças de SEGURANÇA: CSV sem injeção de fórmulas, mascaramento de
 *   dados pessoais, cookies com atributos de segurança, política de senha,
 *   limite de requisições (429), bloqueio de login após falhas e regras da
 *   renovação de sessão (rotação, limite absoluto, usuário desativado).
 *
 * PRINCIPAIS ITENS:
 *   - user: administrador de exemplo.
 *   - 8 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/utils (csv, masking, cookies, password-policy), src/middleware/rate-limit,
 *     src/modules/auth (login-throttle, auth-service), src/config/env,
 *     tests/helpers/fake-sessions.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// JWT (para ler o conteúdo de um token sem verificar: jwt.decode).
const jwt = require('jsonwebtoken');
// Itens testados.
const { toCsv } = require('../../src/utils/csv');
const { maskContactsInText, maskEmail, maskPhone } = require('../../src/utils/masking');
const { parseCookies, serializeCookie } = require('../../src/utils/cookies');
const { getPasswordProblems } = require('../../src/utils/password-policy');
const rateLimit = require('../../src/middleware/rate-limit');
const { createLoginThrottle } = require('../../src/modules/auth/login-throttle');
const { createAuthService } = require('../../src/modules/auth/auth-service');
const { readConfig } = require('../../src/config/env');
const { createFakeSessions } = require('../helpers/fake-sessions');

// Administrador de exemplo.
const user = { id: '11111111-1111-4111-8111-111111111111', nome: 'Carla', email: 'carla@example.org', senha_hash: 'hash', cargo: 'administrador', ativo: true };

// Teste 1: CSV começa com o BOM invisível + cabeçalho; fórmula ganha apóstrofo e aspas duplicadas; ";" fica entre aspas.
// (O primeiro caractere dentro de startsWith('...') abaixo é o BOM, U+FEFF — não aparece na tela.)
test('CSV export neutralizes spreadsheet formulas and quotes separators', () => {
  const csv = toCsv([{ key: 'nome', label: 'Nome' }], [{ nome: '=HYPERLINK("http://mal")' }, { nome: 'Ana; Bia' }]);
  assert.ok(csv.startsWith('﻿Nome\r\n'));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/mal""\)"/);
  assert.match(csv, /"Ana; Bia"/);
});

// Teste 2: máscaras de e-mail e telefone, inclusive dentro de texto livre (a data não é confundida com telefone).
test('personal data masking keeps only what is needed to recognize the contact', () => {
  assert.equal(maskEmail('maria@example.org'), 'ma***@example.org');
  assert.equal(maskPhone('(11) 98888-7777'), '*******7777');
  assert.equal(maskContactsInText('Ligar: (11) 98888-7777, e-mail ana@example.org, desde 2026-08-23'), 'Ligar: *******7777, e-mail an***@example.org, desde 2026-08-23');
});

// Teste 3: leitura de cookies (com %3D decodificado para "=") e escrita com todos os atributos.
test('cookies are parsed and serialized with security attributes', () => {
  assert.deepEqual(parseCookies('a=1; patas_refresh=abc%3D'), { a: '1', patas_refresh: 'abc=' });
  assert.equal(
    serializeCookie('patas_refresh', 'x', { maxAgeSeconds: 60, path: '/api/v1/auth', httpOnly: true, secure: true, sameSite: 'Strict' }),
    'patas_refresh=x; Max-Age=60; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict'
  );
});

// Teste 4: política de senha.
test('password policy requires length, letters and numbers', () => {
  assert.equal(getPasswordProblems('curta1').length, 1);
  assert.deepEqual(getPasswordProblems('somenteletras'), ['Inclua ao menos um número.']);
  assert.deepEqual(getPasswordProblems('senha forte 123'), []);
});

// Teste 5: limite de 2 por minuto → a 3ª requisição recebe 429 e o cabeçalho Retry-After.
test('rate limiter answers 429 with Retry-After after the limit', () => {
  const limiter = rateLimit({ windowMs: 60000, max: 2 });
  const headers = {};
  // Resposta falsa que só guarda os cabeçalhos.
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const results = [];
  // Três chamadas do mesmo IP; o "next" guarda o que recebeu (undefined = sem erro).
  for (let attempt = 0; attempt < 3; attempt += 1) limiter({ ip: '10.0.0.1' }, res, (error) => results.push(error));

  assert.deepEqual(results.slice(0, 2), [undefined, undefined]);
  assert.equal(results[2].status, 429);
  assert.equal(results[2].code, 'MUITAS_REQUISICOES');
  assert.ok(Number(headers['Retry-After']) > 0);
});

// Teste 6: 5 falhas bloqueiam a conta (mesmo inexistente, e sem diferenciar maiúsculas no e-mail).
test('login is locked after repeated failures, even for unknown e-mails', async () => {
  const service = createAuthService({
    repository: { findByEmail: async () => null },
    comparePassword: async () => false,
    throttle: createLoginThrottle(),
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(service.login({ email: 'ninguem@example.org', password: 'errada' }), { code: 'CREDENCIAIS_INVALIDAS' });
  }
  await assert.rejects(service.login({ email: 'NINGUEM@example.org', password: 'errada' }), { status: 429, code: 'LOGIN_BLOQUEADO' });
});

// Teste 7: refresh renova os tokens; recusa lixo e token de ACESSO; recusa sessão que passou do limite total de horas.
test('refresh rotates the session and respects the absolute session limit', async () => {
  const sessions = createFakeSessions();
  const repository = { findByEmail: async () => user, findById: async () => user };
  const service = createAuthService({ repository, comparePassword: async () => true, throttle: createLoginThrottle(), sessions });

  const session = await service.login({ email: user.email, password: 'senha forte 123' });
  const renewed = await service.refresh(session.refreshToken);
  assert.ok(renewed.token);
  assert.ok(renewed.refreshToken);
  assert.equal(renewed.user.cargo, 'administrador');

  await assert.rejects(service.refresh('token-invalido'), { status: 401, code: 'SESSAO_EXPIRADA' });
  // O token de acesso tem outro segredo e outro "typ": não serve para renovar.
  await assert.rejects(service.refresh(session.token), { status: 401, code: 'SESSAO_EXPIRADA' });

  // Simula um login feito há (limite + 1) horas, usando um relógio "no passado".
  const { sessionMaxHours } = readConfig();
  const pastLogin = createAuthService({
    repository,
    comparePassword: async () => true,
    throttle: createLoginThrottle(),
    sessions,
    now: () => Date.now() - (sessionMaxHours + 1) * 3600 * 1000,
  });
  const oldSession = await pastLogin.login({ email: user.email, password: 'senha forte 123' });
  assert.ok(jwt.decode(oldSession.refreshToken).auth_time);
  await assert.rejects(service.refresh(oldSession.refreshToken), { status: 401, code: 'SESSAO_EXPIRADA' });
});

// Teste 8: usuário desativado depois do login não consegue renovar.
test('refresh is refused for users deactivated after login', async () => {
  const sessions = createFakeSessions();
  let active = true;
  const repository = { findByEmail: async () => user, findById: async () => ({ ...user, ativo: active }) };
  const service = createAuthService({ repository, comparePassword: async () => true, throttle: createLoginThrottle(), sessions });
  const session = await service.login({ email: user.email, password: 'senha forte 123' });

  active = false;
  await assert.rejects(service.refresh(session.refreshToken), { status: 401, code: 'SESSAO_INVALIDA' });
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste exercita uma defesa: utilitários (CSV, máscaras, cookies, senha),
 *   middleware (rate limit) e regras do auth-service (bloqueio e renovação).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testes de segurança: injeção em planilhas, força bruta, sessões.
 *   - Simular passagem do tempo com um relógio injetado ("now").
 *   - jwt.decode (lê sem validar) x jwt.verify (valida a assinatura).
 * ============================================================================
 */
