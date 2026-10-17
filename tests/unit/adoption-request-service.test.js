/*
 * ============================================================================
 * ARQUIVO: adoption-request-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do pedido de adoção enviado pelo SITE (adoption-request-service e
 *   adoption-request-validator): cria adotante novo e devolve protocolo,
 *   reaproveita adotante existente sem sobrescrever, recupera-se de inserção
 *   simultânea, recusa animal inexistente/indisponível/pedido repetido e valida
 *   todos os campos do formulário.
 *
 * PRINCIPAIS ITENS:
 *   - animalId, payload (formulário de exemplo).
 *   - createRepository(overrides): repository falso que registra as chamadas.
 *   - 5 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/adoptions/adoption-request-service.js e adoption-request-validator.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Classe de erro.
const AppError = require('../../src/utils/app-error');
// Itens testados.
const { createAdoptionRequestService } = require('../../src/modules/adoptions/adoption-request-service');
const validateAdoptionRequest = require('../../src/modules/adoptions/adoption-request-validator');

// Animal e formulário de exemplo (nome e e-mail com espaços/maiúsculas para testar a normalização).
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

/*
 * FUNÇÃO: createRepository
 * O que faz: repository falso com comportamento padrão "tudo certo"; "overrides" troca funções
 *   específicas para simular outros cenários. As inserções ficam registradas em "calls".
 * Retorno: { repository, calls }.
 */
function createRepository(overrides = {}) {
  const calls = { insertAdopter: [], insertRequest: [] };
  const repository = {
    // Transação falsa: só executa a função.
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
    // As funções de overrides substituem as de cima (o spread que vem depois vence).
    ...overrides,
  };
  return { repository, calls };
}

// Teste 1: adotante novo é criado com dados normalizados; o protocolo vem do id; observações registradas.
test('adoption request creates a new adopter and returns a protocol', async () => {
  const { repository, calls } = createRepository();
  const result = await createAdoptionRequestService(repository).create(payload);

  assert.equal(result.protocolo, 'PAC-A1B2C3D4');
  assert.equal(result.status, 'novo');
  assert.deepEqual(result.animal, { id: animalId, nome: 'Nino' });
  assert.equal(calls.insertAdopter[0].email, 'ana@example.org');
  assert.equal(calls.insertAdopter[0].nome, 'Ana Souza');
  assert.equal(calls.insertRequest[0].adopterId, 'adopter-new');
  // match: o texto contém o padrão (parênteses e ponto escapados com \ na regex).
  assert.match(calls.insertRequest[0].observacoes, /Telefone informado: \(11\) 98888-7777/);
  assert.match(calls.insertRequest[0].observacoes, /Casa com quintal e rotina tranquila\./);
});

// Teste 2: e-mail já cadastrado → usa o adotante existente e não cria outro.
test('adoption request reuses an existing adopter without overwriting it', async () => {
  const { repository, calls } = createRepository({ findAdopterIdByEmail: async () => 'adopter-existing' });
  await createAdoptionRequestService(repository).create(payload);

  assert.equal(calls.insertAdopter.length, 0);
  assert.equal(calls.insertRequest[0].adopterId, 'adopter-existing');
});

// Teste 3: corrida — 1ª busca não acha, a inserção "perde" (null) e a 2ª busca acha o adotante criado por outro envio.
test('adoption request recovers when the adopter is inserted concurrently', async () => {
  let lookups = 0;
  const { repository, calls } = createRepository({
    // lookups++ === 0 é verdadeiro só na primeira chamada.
    findAdopterIdByEmail: async () => (lookups++ === 0 ? null : 'adopter-concurrent'),
    insertAdopter: async () => null,
  });
  await createAdoptionRequestService(repository).create(payload);

  assert.equal(calls.insertRequest[0].adopterId, 'adopter-concurrent');
});

// Teste 4: três cenários de recusa (tabela de casos) — nenhum grava o pedido.
test('adoption request rejects missing, unavailable and already requested animals', async () => {
  // Cada caso: [substituições do repository, status esperado, código esperado].
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

// Teste 5: validador — formulário completo passa; vazio acusa os 8 campos; valores inválidos acusam os certos.
test('adoption request validator requires every form field and both confirmations', () => {
  assert.deepEqual(validateAdoptionRequest({ body: payload }), []);

  const fields = validateAdoptionRequest({ body: {} }).map((detail) => detail.field);
  // sort() ordena para a comparação não depender da ordem dos detalhes.
  assert.deepEqual(fields.sort(), [
    'ambiente_seguro', 'animal_id', 'cidade', 'ciente_pos_adocao', 'email', 'nome', 'rotina', 'telefone',
  ]);

  // ambiente_seguro: 'true' (texto) não vale — precisa ser o booleano true.
  const invalid = validateAdoptionRequest({
    body: { ...payload, telefone: '1234', email: 'sem-arroba', ambiente_seguro: 'true', nome: 'x'.repeat(151) },
  }).map((detail) => detail.field);
  assert.deepEqual(invalid.sort(), ['ambiente_seguro', 'email', 'nome', 'telefone']);
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   createRepository monta um banco falso configurável; cada teste muda só o
 *   necessário (overrides) e confere protocolo, dados gravados ou o erro.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testes orientados a tabela (vários casos num laço).
 *   - Simular condições de corrida em testes.
 *   - Objeto padrão + overrides com spread.
 * ============================================================================
 */
