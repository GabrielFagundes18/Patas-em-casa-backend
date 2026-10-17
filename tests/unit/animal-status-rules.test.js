/*
 * ============================================================================
 * ARQUIVO: animal-status-rules.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES das regras de mudança de status do animal (animal-status-rules.js):
 *   transições permitidas e proibidas, mudanças exclusivas do administrador e
 *   motivo obrigatório.
 *
 * PRINCIPAIS ITENS:
 *   - expectError(input, status, code): confere que a função lança o erro esperado.
 *   - 3 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/animals/animal-status-rules.js (testado).
 *   - Usa o executor de testes nativo do Node (node:test) e node:assert.
 * ============================================================================
 */

// assert/strict: funções de verificação (comparações estritas, sem conversão de tipos).
const assert = require('node:assert/strict');
// test: executor de testes nativo do Node (rodado por "npm test").
const test = require('node:test');
// Função testada.
const { assertStatusTransition } = require('../../src/modules/animals/animal-status-rules');

/*
 * FUNÇÃO: expectError
 * O que faz: confere que assertStatusTransition(input) lança um erro com o status e o código esperados.
 * Detalhe: assert.throws(fn, validador) — o validador recebe o erro e devolve true se estiver certo.
 */
function expectError(input, status, code) {
  assert.throws(() => assertStatusTransition(input), (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

// Teste 1: transições da tabela passam; "pular" etapas (ex.: disponível → adotado) é recusado (409).
test('allowed animal status transitions pass and unknown ones are rejected', () => {
  assert.doesNotThrow(() => assertStatusTransition({ from: 'disponivel', to: 'urgente', role: 'gestor_animais' }));
  // Mesmo status: nada muda, então passa para qualquer cargo.
  assert.doesNotThrow(() => assertStatusTransition({ from: 'disponivel', to: 'disponivel', role: 'voluntariado' }));
  expectError({ from: 'disponivel', to: 'adotado', role: 'administrador' }, 409, 'TRANSICAO_INVALIDA');
  expectError({ from: 'inativo', to: 'em_processo', role: 'administrador' }, 409, 'TRANSICAO_INVALIDA');
});

// Teste 2: adoção manual e cadastro já adotado só para administrador (403 para os demais).
test('manual adoption and returns are restricted to administrators', () => {
  expectError({ from: 'em_processo', to: 'adotado', role: 'gestor_animais' }, 403, 'TRANSICAO_NAO_PERMITIDA');
  assert.doesNotThrow(() => assertStatusTransition({ from: 'em_processo', to: 'adotado', role: 'administrador' }));
  // from: null = cadastro novo.
  expectError({ from: null, to: 'adotado', role: 'gestor_animais' }, 403, 'TRANSICAO_NAO_PERMITIDA');
});

// Teste 3: inativar e devolver exigem motivo com 5+ caracteres (422 sem motivo ou com motivo curto).
test('deactivation and returns require a reason', () => {
  expectError({ from: 'disponivel', to: 'inativo', role: 'gestor_animais' }, 422, 'MOTIVO_OBRIGATORIO');
  expectError({ from: 'adotado', to: 'disponivel', role: 'administrador', motivo: 'ok' }, 422, 'MOTIVO_OBRIGATORIO');
  assert.doesNotThrow(() => assertStatusTransition({
    from: 'adotado', to: 'disponivel', role: 'administrador', motivo: 'Devolução após adaptação malsucedida',
  }));
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste chama a regra com combinações de "de", "para", cargo e motivo e
 *   confere se passa (doesNotThrow) ou se lança o erro certo (expectError).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testes unitários com node:test e node:assert.
 *   - assert.throws / assert.doesNotThrow.
 *   - Testar casos de sucesso E de erro (incluindo limites, como motivo curto).
 * ============================================================================
 */
