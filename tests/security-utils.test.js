const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { toCsv } = require('../src/utils/csv');
const { maskContactsInText, maskEmail, maskPhone } = require('../src/utils/masking');
const { parseCookies, serializeCookie } = require('../src/utils/cookies');
const { getPasswordProblems } = require('../src/utils/password-policy');
const rateLimit = require('../src/middleware/rate-limit');
const { createLoginThrottle } = require('../src/services/auth/login-throttle');
const { createAuthService } = require('../src/services/auth/auth-service');
const { readConfig } = require('../src/config/env');

const user = { id: '11111111-1111-4111-8111-111111111111', nome: 'Carla', email: 'carla@example.org', senha_hash: 'hash', cargo: 'administrador', ativo: true };

test('CSV export neutralizes spreadsheet formulas and quotes separators', () => {
  const csv = toCsv([{ key: 'nome', label: 'Nome' }], [{ nome: '=HYPERLINK("http://mal")' }, { nome: 'Ana; Bia' }]);
  assert.ok(csv.startsWith('﻿Nome\r\n'));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/mal""\)"/);
  assert.match(csv, /"Ana; Bia"/);
});

test('personal data masking keeps only what is needed to recognize the contact', () => {
  assert.equal(maskEmail('maria@example.org'), 'ma***@example.org');
  assert.equal(maskPhone('(11) 98888-7777'), '*******7777');
  assert.equal(maskContactsInText('Ligar: (11) 98888-7777, e-mail ana@example.org, desde 2026-08-23'), 'Ligar: *******7777, e-mail an***@example.org, desde 2026-08-23');
});

test('cookies are parsed and serialized with security attributes', () => {
  assert.deepEqual(parseCookies('a=1; patas_refresh=abc%3D'), { a: '1', patas_refresh: 'abc=' });
  assert.equal(
    serializeCookie('patas_refresh', 'x', { maxAgeSeconds: 60, path: '/api/v1/auth', httpOnly: true, secure: true, sameSite: 'Strict' }),
    'patas_refresh=x; Max-Age=60; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict'
  );
});

test('password policy requires length, letters and numbers', () => {
  assert.equal(getPasswordProblems('curta1').length, 1);
  assert.deepEqual(getPasswordProblems('somenteletras'), ['Inclua ao menos um número.']);
  assert.deepEqual(getPasswordProblems('senha forte 123'), []);
});

test('rate limiter answers 429 with Retry-After after the limit', () => {
  const limiter = rateLimit({ windowMs: 60000, max: 2 });
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  const results = [];
  for (let attempt = 0; attempt < 3; attempt += 1) limiter({ ip: '10.0.0.1' }, res, (error) => results.push(error));

  assert.deepEqual(results.slice(0, 2), [undefined, undefined]);
  assert.equal(results[2].status, 429);
  assert.equal(results[2].code, 'MUITAS_REQUISICOES');
  assert.ok(Number(headers['Retry-After']) > 0);
});

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

test('refresh rotates the session and respects the absolute session limit', async () => {
  const repository = { findByEmail: async () => user, findById: async () => user };
  const service = createAuthService({ repository, comparePassword: async () => true, throttle: createLoginThrottle() });

  const session = await service.login({ email: user.email, password: 'senha forte 123' });
  const renewed = await service.refresh(session.refreshToken);
  assert.ok(renewed.token);
  assert.ok(renewed.refreshToken);
  assert.equal(renewed.user.cargo, 'administrador');

  await assert.rejects(service.refresh('token-invalido'), { status: 401, code: 'SESSAO_EXPIRADA' });
  await assert.rejects(service.refresh(session.token), { status: 401, code: 'SESSAO_EXPIRADA' });

  const { sessionMaxHours } = readConfig();
  const pastLogin = createAuthService({
    repository,
    comparePassword: async () => true,
    throttle: createLoginThrottle(),
    now: () => Date.now() - (sessionMaxHours + 1) * 3600 * 1000,
  });
  const oldSession = await pastLogin.login({ email: user.email, password: 'senha forte 123' });
  assert.ok(jwt.decode(oldSession.refreshToken).auth_time);
  await assert.rejects(service.refresh(oldSession.refreshToken), { status: 401, code: 'SESSAO_EXPIRADA' });
});

test('refresh is refused for users deactivated after login', async () => {
  let active = true;
  const repository = { findByEmail: async () => user, findById: async () => ({ ...user, ativo: active }) };
  const service = createAuthService({ repository, comparePassword: async () => true, throttle: createLoginThrottle() });
  const session = await service.login({ email: user.email, password: 'senha forte 123' });

  active = false;
  await assert.rejects(service.refresh(session.refreshToken), { status: 401, code: 'SESSAO_INVALIDA' });
});
