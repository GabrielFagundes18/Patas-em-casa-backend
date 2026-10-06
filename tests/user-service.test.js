const assert = require('node:assert/strict');
const test = require('node:test');
const { createUserService } = require('../src/services/users/user-service');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ADMIN_ID = '66666666-6666-4666-8666-666666666666';

function setup({ admins = 1 } = {}) {
  const users = new Map([[ADMIN_ID, { id: ADMIN_ID, nome: 'Carla', email: 'carla@example.org', cargo: 'administrador', ativo: true }]]);
  if (admins > 1) users.set(OTHER_ADMIN_ID, { id: OTHER_ADMIN_ID, nome: 'Rui', email: 'rui@example.org', cargo: 'administrador', ativo: true });
  const audits = [];
  const repository = {
    findById: async (id) => (users.has(id) ? { ...users.get(id) } : null),
    create: async (user) => {
      if ([...users.values()].some((existing) => existing.email === user.email)) {
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      }
      const created = { id: '77777777-7777-4777-8777-777777777777', nome: user.nome, email: user.email, cargo: user.cargo, ativo: user.ativo };
      users.set(created.id, created);
      return { ...created };
    },
    update: async (id, changes) => Object.assign(users.get(id), changes) && { ...users.get(id) },
    updatePassword: async () => true,
    countActiveAdministrators: async () => [...users.values()].filter((user) => user.cargo === 'administrador' && user.ativo).length,
  };
  const service = createUserService(repository, {
    audit: { record: async (event) => audits.push(event) },
    hashPassword: async (password) => `hash:${password}`,
  });
  return { service, users, audits };
}

test('team members are created with a strong password and listed permissions', async () => {
  const { service, audits } = setup();

  await assert.rejects(
    service.create({ nome: 'João', email: 'joao@example.org', cargo: 'gestor_animais', senha: 'fraca' }, { userId: ADMIN_ID }),
    { status: 422, code: 'SENHA_FRACA' }
  );

  const created = await service.create({ nome: ' João ', email: 'JOAO@example.org', cargo: 'gestor_animais', senha: 'senha forte 123' }, { userId: ADMIN_ID });
  assert.equal(created.email, 'joao@example.org');
  assert.ok(created.permissions.includes('animals:update'));
  assert.equal(Object.hasOwn(created, 'senha_hash'), false);
  assert.equal(audits[0].action, 'criar');

  await assert.rejects(
    service.create({ nome: 'Outro', email: 'joao@example.org', cargo: 'financeiro', senha: 'senha forte 123' }, {}),
    { status: 409, code: 'EMAIL_EM_USO' }
  );
});

test('administrators cannot demote or deactivate themselves', async () => {
  const { service } = setup({ admins: 2 });
  await assert.rejects(service.update(ADMIN_ID, { ativo: false }, { userId: ADMIN_ID }), { status: 409, code: 'ALTERACAO_PROPRIA_BLOQUEADA' });
  await assert.rejects(service.update(ADMIN_ID, { cargo: 'financeiro' }, { userId: ADMIN_ID }), { status: 409, code: 'ALTERACAO_PROPRIA_BLOQUEADA' });
});

test('the last active administrator cannot be removed', async () => {
  const single = setup();
  await assert.rejects(single.service.update(ADMIN_ID, { ativo: false }, { userId: OTHER_ADMIN_ID }), { status: 409, code: 'ULTIMO_ADMINISTRADOR' });

  const pair = setup({ admins: 2 });
  const updated = await pair.service.update(ADMIN_ID, { ativo: false }, { userId: OTHER_ADMIN_ID });
  assert.equal(updated.ativo, false);
  assert.deepEqual(pair.audits[0].before, { ativo: true });
});
