const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { setUserPassword, validatePassword } = require('../../scripts/definir-senha');

test('password script stores a bcrypt hash for the normalized e-mail', async () => {
  let receivedQuery;
  const database = {
    query: async (text, values) => {
      receivedQuery = { text, values };
      return { rows: [{ nome: 'Carla Mendes', cargo: 'administrador' }] };
    },
  };

  const user = await setUserPassword(database, ' Carla@PatasEmCasa.org ', 'senha forte 123');

  assert.deepEqual(user, { nome: 'Carla Mendes', cargo: 'administrador' });
  assert.equal(receivedQuery.values[1], 'carla@patasemcasa.org');
  assert.match(receivedQuery.values[0], /^\$2[aby]\$12\$.{53}$/);
  assert.equal(await bcrypt.compare('senha forte 123', receivedQuery.values[0]), true);
});

test('password script reports unknown e-mails', async () => {
  const database = { query: async () => ({ rows: [] }) };
  assert.equal(await setUserPassword(database, 'ninguem@example.org', 'senha forte 123'), null);
});

test('password script applies the API password policy and confirmation', () => {
  assert.match(validatePassword('curta1', 'curta1'), /pelo menos 10/);
  assert.match(validatePassword('somenteletras', 'somenteletras'), /número/);
  assert.match(validatePassword(`${'a'.repeat(72)}1`, `${'a'.repeat(72)}1`), /72 bytes/);
  assert.match(validatePassword('senha forte 123', 'outra senha 123'), /não conferem/);
  assert.equal(validatePassword('senha forte 123', 'senha forte 123'), null);
});
