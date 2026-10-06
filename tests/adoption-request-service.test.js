const assert = require('node:assert/strict');
const test = require('node:test');
const AppError = require('../src/utils/app-error');
const { createAdoptionRequestService } = require('../src/services/adoptions/adoption-request-service');
const validateAdoptionRequest = require('../src/validators/adoptions/adoption-request-validator');

const animalId = '550e8400-e29b-41d4-a716-446655440000';
const payload = {
  animal_id: animalId,
  nome: '  Ana Souza ',
  email: ' Ana@Example.org ',
  telefone: '(11) 98888-7777',
  cidade: 'Campinas',
  rotina: 'Casa com quintal e rotina tranquila.',
  ambiente_seguro: true,
  ciente_pos_adocao: true,
};

function createRepository(overrides = {}) {
  const calls = { insertAdopter: [], insertRequest: [] };
  const repository = {
    withTransaction: async (work) => work('tx'),
    findAnimalForRequest: async () => ({ id: animalId, nome: 'Nino', status: 'disponivel' }),
    findAdopterIdByEmail: async () => null,
    insertAdopter: async (db, adopter) => {
      calls.insertAdopter.push(adopter);
      return 'adopter-new';
    },
    hasOpenRequest: async () => false,
    insertRequest: async (db, request) => {
      calls.insertRequest.push(request);
      return { id: 'a1b2c3d4-0000-4000-8000-000000000000', status: 'novo', data_pedido: '2026-10-04T12:00:00.000Z' };
    },
    ...overrides,
  };
  return { repository, calls };
}

test('adoption request creates a new adopter and returns a protocol', async () => {
  const { repository, calls } = createRepository();
  const result = await createAdoptionRequestService(repository).create(payload);

  assert.equal(result.protocolo, 'PAC-A1B2C3D4');
  assert.equal(result.status, 'novo');
  assert.deepEqual(result.animal, { id: animalId, nome: 'Nino' });
  assert.equal(calls.insertAdopter[0].email, 'ana@example.org');
  assert.equal(calls.insertAdopter[0].nome, 'Ana Souza');
  assert.equal(calls.insertRequest[0].adopterId, 'adopter-new');
  assert.match(calls.insertRequest[0].observacoes, /Telefone informado: \(11\) 98888-7777/);
  assert.match(calls.insertRequest[0].observacoes, /Casa com quintal e rotina tranquila\./);
});

test('adoption request reuses an existing adopter without overwriting it', async () => {
  const { repository, calls } = createRepository({ findAdopterIdByEmail: async () => 'adopter-existing' });
  await createAdoptionRequestService(repository).create(payload);

  assert.equal(calls.insertAdopter.length, 0);
  assert.equal(calls.insertRequest[0].adopterId, 'adopter-existing');
});

test('adoption request recovers when the adopter is inserted concurrently', async () => {
  let lookups = 0;
  const { repository, calls } = createRepository({
    findAdopterIdByEmail: async () => (lookups++ === 0 ? null : 'adopter-concurrent'),
    insertAdopter: async () => null,
  });
  await createAdoptionRequestService(repository).create(payload);

  assert.equal(calls.insertRequest[0].adopterId, 'adopter-concurrent');
});

test('adoption request rejects missing, unavailable and already requested animals', async () => {
  const cases = [
    [{ findAnimalForRequest: async () => null }, 404, 'ANIMAL_NAO_ENCONTRADO'],
    [{ findAnimalForRequest: async () => ({ id: animalId, nome: 'Nino', status: 'adotado' }) }, 409, 'ANIMAL_INDISPONIVEL'],
    [{ hasOpenRequest: async () => true }, 409, 'PEDIDO_EM_ANDAMENTO'],
  ];

  for (const [overrides, status, code] of cases) {
    const { repository, calls } = createRepository(overrides);
    await assert.rejects(createAdoptionRequestService(repository).create(payload), (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      return true;
    });
    assert.equal(calls.insertRequest.length, 0);
  }
});

test('adoption request validator requires every form field and both confirmations', () => {
  assert.deepEqual(validateAdoptionRequest({ body: payload }), []);

  const fields = validateAdoptionRequest({ body: {} }).map((detail) => detail.field);
  assert.deepEqual(fields.sort(), [
    'ambiente_seguro', 'animal_id', 'cidade', 'ciente_pos_adocao', 'email', 'nome', 'rotina', 'telefone',
  ]);

  const invalid = validateAdoptionRequest({
    body: { ...payload, telefone: '1234', email: 'sem-arroba', ambiente_seguro: 'true', nome: 'x'.repeat(151) },
  }).map((detail) => detail.field);
  assert.deepEqual(invalid.sort(), ['ambiente_seguro', 'email', 'nome', 'telefone']);
});
