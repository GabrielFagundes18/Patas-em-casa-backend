/*
 * ============================================================================
 * ARQUIVO: definir-senha.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do script scripts/definir-senha.js: grava um hash bcrypt para o
 *   e-mail normalizado, avisa e-mail inexistente e aplica a política de senha e
 *   a confirmação.
 *
 * PRINCIPAIS ITENS:
 *   - 3 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - scripts/definir-senha.js (setUserPassword, validatePassword) e bcryptjs.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// bcrypt (para conferir o hash gravado).
const bcrypt = require('bcryptjs');
// Funções testadas.
const { setUserPassword, validatePassword } = require('../../scripts/definir-senha');

// Teste 1: grava um hash bcrypt de custo 12 para o e-mail normalizado.
test('password script stores a bcrypt hash for the normalized e-mail', async () => {
  let receivedQuery;
  // Banco falso que guarda a consulta recebida.
  const database = {
    query: async (text, values) => {
      receivedQuery = { text, values };
      return { rows: [{ nome: 'Carla Mendes', cargo: 'administrador' }] };
    },
  };

  const user = await setUserPassword(database, ' Carla@PatasEmCasa.org ', 'senha forte 123');

  assert.deepEqual(user, { nome: 'Carla Mendes', cargo: 'administrador' });
  assert.equal(receivedQuery.values[1], 'carla@patasemcasa.org');
  // Formato do hash bcrypt: $2a$/$2b$/$2y$ + custo 12 + 53 caracteres (sal + hash).
  assert.match(receivedQuery.values[0], /^\$2[aby]\$12\$.{53}$/);
  assert.equal(await bcrypt.compare('senha forte 123', receivedQuery.values[0]), true);
});

// Teste 2: e-mail inexistente → null.
test('password script reports unknown e-mails', async () => {
  const database = { query: async () => ({ rows: [] }) };
  assert.equal(await setUserPassword(database, 'ninguem@example.org', 'senha forte 123'), null);
});

// Teste 3: mensagens da política (curta, sem número, mais de 72 bytes) e da confirmação.
test('password script applies the API password policy and confirmation', () => {
  assert.match(validatePassword('curta1', 'curta1'), /pelo menos 10/);
  assert.match(validatePassword('somenteletras', 'somenteletras'), /número/);
  assert.match(validatePassword(`${'a'.repeat(72)}1`, `${'a'.repeat(72)}1`), /72 bytes/);
  assert.match(validatePassword('senha forte 123', 'outra senha 123'), /não conferem/);
  assert.equal(validatePassword('senha forte 123', 'senha forte 123'), null);
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As funções exportadas do script são testadas com um banco falso; o terminal
 *   interativo (main) não é testado aqui.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Estrutura de um hash bcrypt ($versão$custo$sal+hash).
 *   - Exportar partes de um script para conseguir testá-las.
 * ============================================================================
 */
