const assert = require('node:assert/strict');
const test = require('node:test');
const AppError = require('../../src/utils/app-error');
const { createAnimalService: createService } = require('../../src/modules/animals/animal-service');

const noAudit = { record: async () => {} };
const createAnimalService = (repository, options = {}) => createService(repository, { audit: noAudit, ...options });

const animalRecord = { id: 'a1', nome: 'Nino', especie: 'cachorro', status: 'disponivel' };

test('animal list sends normalized filters and capped pagination to repository', async () => {
  let receivedFilters;
  const service = createAnimalService({
    list: async (filters) => {
      receivedFilters = filters;
      return { items: [animalRecord], total: 1 };
    },
  });

  const result = await service.list({ page: '2', pageSize: '500', q: ' Nino ', castrado: 'false', order: 'ASC' });

  assert.deepEqual(result.items, [animalRecord]);
  assert.equal(receivedFilters.page, 2);
  assert.equal(receivedFilters.pageSize, 100);
  assert.equal(receivedFilters.offset, 100);
  assert.equal(receivedFilters.q, 'Nino');
  assert.equal(receivedFilters.castrado, false);
  assert.equal(receivedFilters.order, 'asc');
});

test('public animal list requests only available and urgent records', async () => {
  let receivedFilters;
  const service = createAnimalService({
    list: async (filters) => {
      receivedFilters = filters;
      return { items: [animalRecord], total: 1 };
    },
  });

  await service.listPublic();

  assert.deepEqual(receivedFilters.statusIn, ['disponivel', 'urgente']);
  assert.equal(receivedFilters.pageSize, 100);
});

test('animal creation applies schema defaults without mutating input', async () => {
  let createdAnimal;
  const service = createAnimalService({
    create: async (animal) => {
      createdAnimal = animal;
      return { id: 'a2', ...animal };
    },
  });
  const input = { nome: '  Luna  ', especie: 'gato' };

  await service.create(input);

  assert.equal(createdAnimal.nome, 'Luna');
  assert.equal(createdAnimal.status, 'disponivel');
  assert.equal(createdAnimal.castrado, false);
  assert.equal(createdAnimal.vacinado, false);
  assert.equal(input.nome, '  Luna  ');
});

test('animal delete maps foreign key conflicts to a stable conflict error', async () => {
  const service = createAnimalService({
    findById: async () => animalRecord,
    remove: async () => {
      const error = new Error('foreign key conflict');
      error.code = '23503';
      throw error;
    },
  }, { media: { listForAnimal: async () => [] } });

  await assert.rejects(service.remove('a1'), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ANIMAL_COM_PEDIDO');
    return true;
  });
});

test('missing animal returns a stable not found error', async () => {
  const service = createAnimalService({ findById: async () => null });
  await assert.rejects(service.getById('missing'), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, 'ANIMAL_NAO_ENCONTRADO');
    return true;
  });
});