const assert = require('node:assert/strict');
const test = require('node:test');
const { createAuthService } = require('../src/services/auth/auth-service');
const { createAccessLinkService, hashToken } = require('../src/services/auth/access-link-service');
const { createLoginThrottle } = require('../src/services/auth/login-throttle');
const { createFakeSessions } = require('./helpers/fake-sessions');

const user = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  nome: 'Carla Lima',
  email: 'carla@example.org',
  senha_hash: 'hash',
  cargo: 'gestor_ong',
  ativo: true,
};

function setupAuth({ accessLinks, users = { [user.id]: user } } = {}) {
  const sessions = createFakeSessions();
  const passwords = [];
  const service = createAuthService({
    repository: {
      findByEmail: async (email) => Object.values(users).find((u) => u.email === email) || null,
      findById: async (id) => users[id] || null,
      findByIdWithPassword: async (id) => users[id] || null,
      updatePassword: async (id, hash) => passwords.push({ id, hash }),
    },
    comparePassword: async (password) => password === 'SenhaAtual123',
    hashPassword: async (password) => `hash:${password}`,
    throttle: createLoginThrottle(),
    sessions,
    accessLinks,
    transaction: (work) => work('tx'),
    log: { error: () => {} },
  });
  return { service, sessions, passwords };
}

test('logout revokes the session in the database, so the refresh cookie stops working', async () => {
  const { service, sessions } = setupAuth();
  const session = await service.login({ email: user.email, password: 'SenhaAtual123' }, { userAgent: 'Firefox' });

  assert.equal([...sessions.rows.values()][0].agente_usuario, 'Firefox');
  assert.ok(await service.refresh(session.refreshToken));

  await service.logout(session.refreshToken);
  await assert.rejects(service.refresh(session.refreshToken), { status: 401, code: 'SESSAO_EXPIRADA' });
  await service.logout('cookie-invalido');
});

test('changing the own password keeps the current session and ends the others', async () => {
  const { service, sessions } = setupAuth();
  const current = await service.login({ email: user.email, password: 'SenhaAtual123' });
  const other = await service.login({ email: user.email, password: 'SenhaAtual123' });
  const currentId = [...sessions.rows.keys()][0];

  await service.changeOwnPassword(user.id, { senha_atual: 'SenhaAtual123', nova_senha: 'NovaSenha2026' }, { sessionId: currentId });

  assert.ok(await service.refresh(current.refreshToken));
  await assert.rejects(service.refresh(other.refreshToken), { code: 'SESSAO_EXPIRADA' });
});

test('forgot password answers the same way for unknown, inactive and active accounts', async () => {
  const sent = [];
  const inactive = { ...user, id: '660e8400-e29b-41d4-a716-446655440000', email: 'off@example.org', ativo: false };
  const { service } = setupAuth({
    users: { [user.id]: user, [inactive.id]: inactive },
    accessLinks: { send: async (target, finalidade) => sent.push({ email: target.email, finalidade }) && { enviado: true } },
  });

  assert.equal(await service.requestPasswordReset({ email: 'ninguem@example.org' }), undefined);
  assert.equal(await service.requestPasswordReset({ email: 'off@example.org' }), undefined);
  assert.equal(await service.requestPasswordReset({ email: ' CARLA@example.org ' }), undefined);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sent, [{ email: user.email, finalidade: 'redefinicao' }]);
});

test('a reset link sets the password once, ends every session and rejects weak passwords', async () => {
  let valid = true;
  const { service, sessions, passwords } = setupAuth({
    accessLinks: {
      consume: async (db, token) => (token === 'token-valido-de-teste-123' && valid
        ? (valid = false, { usuario_id: user.id, email: user.email, finalidade: 'redefinicao' })
        : null),
    },
  });
  const session = await service.login({ email: user.email, password: 'SenhaAtual123' });

  await assert.rejects(service.resetPassword({ token: 'token-valido-de-teste-123', nova_senha: 'curta' }), { status: 422, code: 'SENHA_FRACA' });
  const result = await service.resetPassword({ token: 'token-valido-de-teste-123', nova_senha: 'NovaSenha2026' });

  assert.equal(result.finalidade, 'redefinicao');
  assert.deepEqual(passwords, [{ id: user.id, hash: 'hash:NovaSenha2026' }]);
  await assert.rejects(service.refresh(session.refreshToken), { code: 'SESSAO_EXPIRADA' });
  await assert.rejects(service.resetPassword({ token: 'token-valido-de-teste-123', nova_senha: 'NovaSenha2026' }), { status: 400, code: 'LINK_INVALIDO' });
  assert.equal(sessions.rows.size, 1);
});

test('access links store only the token hash, invalidate older links and point to the site', async () => {
  const stored = [];
  const messages = [];
  const links = createAccessLinkService({
    repository: {
      invalidatePending: async (db, id) => stored.forEach((row) => { if (row.usuarioId === id) row.used = true; }),
      create: async (db, row) => stored.push({ ...row, used: false }),
      findValidForUpdate: async (db, hash) => {
        const row = stored.find((item) => item.tokenHash.equals(hash) && !item.used && item.expiraEm > new Date());
        return row ? { usuario_id: row.usuarioId, finalidade: row.finalidade, ativo: true } : null;
      },
    },
    mailer: { isConfigured: () => true, send: async (message) => messages.push(message) },
    config: { frontendUrl: 'https://patas.example' },
    log: { error: () => {} },
  });

  assert.deepEqual(await links.send(user, 'convite'), { enviado: true });
  const url = new URL(messages[0].text.match(/https:\/\/patas\.example\S+/)[0]);
  const token = url.searchParams.get('token');

  assert.equal(url.pathname, '/admin/redefinir-senha');
  assert.equal(url.searchParams.get('convite'), '1');
  assert.match(messages[0].subject, /Convite/);
  assert.match(messages[0].text, /Gestor da ONG/);
  assert.ok(stored[0].tokenHash.equals(hashToken(token)));
  assert.equal(JSON.stringify(stored).includes(token), false);

  await links.send(user, 'redefinicao');
  assert.equal(await links.consume('tx', token), null);
  const latest = new URL(messages[1].text.match(/https:\/\/patas\.example\S+/)[0]).searchParams.get('token');
  assert.equal((await links.consume('tx', latest)).finalidade, 'redefinicao');
  assert.equal(await links.consume('tx', latest), null);
});

test('without SMTP, access links are not created and the reason is returned', async () => {
  const links = createAccessLinkService({
    repository: { invalidatePending: async () => assert.fail('não deveria criar link'), create: async () => assert.fail() },
    mailer: { isConfigured: () => false },
    config: { frontendUrl: 'https://patas.example' },
  });
  assert.deepEqual(await links.send(user, 'convite'), { enviado: false, motivo: 'O envio de e-mails não está configurado no servidor (SMTP).' });
});
