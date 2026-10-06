const assert = require('node:assert/strict');
const test = require('node:test');
const { planMigrations, readOrder } = require('../scripts/migrar');

test('the migration order lists existing files, starting with the base schema', () => {
  const migrations = readOrder();
  assert.equal(migrations[0].name, '000-patas-em-casa-schema.sql');
  assert.ok(migrations.every((m) => /^[0-9a-f]{64}$/.test(m.checksum) && m.sql.length > 0));
});

test('only pending migrations are applied, and an applied file cannot change', () => {
  const migrations = [
    { name: '000.sql', checksum: 'a' },
    { name: '009.sql', checksum: 'b' },
  ];

  assert.deepEqual(planMigrations(migrations, []).map((m) => m.name), ['000.sql', '009.sql']);
  assert.deepEqual(planMigrations(migrations, [{ nome: '000.sql', checksum: 'a' }]).map((m) => m.name), ['009.sql']);
  assert.throws(() => planMigrations(migrations, [{ nome: '000.sql', checksum: 'x' }]), /000\.sql/);
});
