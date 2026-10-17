/*
 * ============================================================================
 * ARQUIVO: animal-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do animal-service: filtros e paginação enviados ao repository, lista
 *   pública só com disponíveis/urgentes, valores padrão no cadastro (sem alterar
 *   o objeto recebido) e tradução de erros (409 e 404).
 *
 * PRINCIPAIS ITENS:
 *   - noAudit, createAnimalService (atalho com auditoria desligada), animalRecord.
 *   - 5 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/animals/animal-service.js, src/utils/app-error.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Classe de erro.
const AppError = require('../../src/utils/app-error');
// Fábrica do service, renomeada para createService ("as" na desestruturação: ": createService").
const { createAnimalService: createService } = require('../../src/modules/animals/animal-service');

// Auditoria que não faz nada.
const noAudit = { record: async () => {} };
// Atalho: cria o service sempre com a auditoria desligada (opções extras podem ser passadas).
const createAnimalService = (repository, options = {}) => createService(repository, { audit: noAudit, ...options });

// Animal de exemplo.
const animalRecord = { id: 'a1', nome: 'Nino', especie: 'cachorro', status: 'disponivel' };

// Teste 1: a lista normaliza os filtros (página, limite de 100, busca sem espaços, booleano, ordem minúscula).
test('animal list sends normalized filters and capped pagination to repository', async () => {
  let receivedFilters;
  const service = createAnimalService({
    // Repository falso que guarda os filtros recebidos.
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

// Teste 2: a lista pública pede só os status públicos.
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

// Teste 3: cadastro aplica padrões (status, castrado, vacinado), limpa o nome e NÃO altera o objeto de entrada.
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
  // O objeto original continua com os espaços (não foi "mutado").
  assert.equal(input.nome, '  Luna  ');
});

// Teste 4: erro de chave estrangeira do banco (23503) vira 409 ANIMAL_COM_PEDIDO.
test('animal delete maps foreign key conflicts to a stable conflict error', async () => {
  const service = createAnimalService({
    findById: async () => animalRecord,
    // Simula o erro que o PostgreSQL lançaria.
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

// Teste 5: animal inexistente → 404 ANIMAL_NAO_ENCONTRADO.
test('missing animal returns a stable not found error', async () => {
  const service = createAnimalService({ findById: async () => null });
  await assert.rejects(service.getById('missing'), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.code, 'ANIMAL_NAO_ENCONTRADO');
    return true;
  });
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste injeta um repository falso com só as funções necessárias, chama o
 *   service e confere o que o repository recebeu ou o erro devolvido.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - "Espiar" argumentos recebidos por dublês (receivedFilters).
 *   - Imutabilidade: funções não devem alterar os objetos recebidos.
 *   - Simular erros do banco nos testes.
 * ============================================================================
 */
