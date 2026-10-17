/*
 * ============================================================================
 * ARQUIVO: migrar.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do script de migrations (scripts/migrar.js): a ordem lida do
 *   ordem.json começa pelo schema base e cada arquivo tem checksum válido; só as
 *   pendentes são aplicadas; uma migration já aplicada não pode mudar.
 *
 * PRINCIPAIS ITENS:
 *   - 2 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - scripts/migrar.js (readOrder, planMigrations) e migrations/ordem.json.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Funções testadas.
const { planMigrations, readOrder } = require('../../scripts/migrar');

// Teste 1: lê os arquivos de verdade; o primeiro é o schema 000; todo checksum tem 64 caracteres hex.
test('the migration order lists existing files, starting with the base schema', () => {
  const migrations = readOrder();
  assert.equal(migrations[0].name, '000-patas-em-casa-schema.sql');
  // every: todos os itens precisam passar.
  assert.ok(migrations.every((m) => /^[0-9a-f]{64}$/.test(m.checksum) && m.sql.length > 0));
});

// Teste 2: com dados de exemplo — nada aplicado → as duas; 000 aplicada → só a 009;
// 000 aplicada com checksum diferente → erro citando "000.sql".
test('only pending migrations are applied, and an applied file cannot change', () => {
  const migrations = [
    { name: '000.sql', checksum: 'a' },
    { name: '009.sql', checksum: 'b' },
  ];

  assert.deepEqual(planMigrations(migrations, []).map((m) => m.name), ['000.sql', '009.sql']);
  assert.deepEqual(planMigrations(migrations, [{ nome: '000.sql', checksum: 'a' }]).map((m) => m.name), ['009.sql']);
  assert.throws(() => planMigrations(migrations, [{ nome: '000.sql', checksum: 'x' }]), /000\.sql/);
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O 1º teste usa os arquivos reais (sem banco); o 2º testa a lógica de decisão
 *   com objetos simples.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Separar a lógica pura (planMigrations) do acesso ao banco para testar fácil.
 *   - Checksums como proteção contra alterações acidentais.
 * ============================================================================
 */
