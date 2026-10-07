const assert = require('node:assert/strict');
const test = require('node:test');
const { assertStatusTransition } = require('../../src/modules/animals/animal-status-rules');

function expectError(input, status, code) {
  assert.throws(() => assertStatusTransition(input), (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test('allowed animal status transitions pass and unknown ones are rejected', () => {
  assert.doesNotThrow(() => assertStatusTransition({ from: 'disponivel', to: 'urgente', role: 'gestor_animais' }));
  assert.doesNotThrow(() => assertStatusTransition({ from: 'disponivel', to: 'disponivel', role: 'voluntariado' }));
  expectError({ from: 'disponivel', to: 'adotado', role: 'administrador' }, 409, 'TRANSICAO_INVALIDA');
  expectError({ from: 'inativo', to: 'em_processo', role: 'administrador' }, 409, 'TRANSICAO_INVALIDA');
});

test('manual adoption and returns are restricted to administrators', () => {
  expectError({ from: 'em_processo', to: 'adotado', role: 'gestor_animais' }, 403, 'TRANSICAO_NAO_PERMITIDA');
  assert.doesNotThrow(() => assertStatusTransition({ from: 'em_processo', to: 'adotado', role: 'administrador' }));
  expectError({ from: null, to: 'adotado', role: 'gestor_animais' }, 403, 'TRANSICAO_NAO_PERMITIDA');
});

test('deactivation and returns require a reason', () => {
  expectError({ from: 'disponivel', to: 'inativo', role: 'gestor_animais' }, 422, 'MOTIVO_OBRIGATORIO');
  expectError({ from: 'adotado', to: 'disponivel', role: 'administrador', motivo: 'ok' }, 422, 'MOTIVO_OBRIGATORIO');
  assert.doesNotThrow(() => assertStatusTransition({
    from: 'adotado', to: 'disponivel', role: 'administrador', motivo: 'Devolução após adaptação malsucedida',
  }));
});
