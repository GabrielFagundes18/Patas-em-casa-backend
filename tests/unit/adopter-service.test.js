/*
 * ============================================================================
 * ARQUIVO: adopter-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do adopter-service (LGPD): contatos mascarados por padrão (inclusive
 *   dentro das observações), revelação auditada e anonimização (bloqueada com
 *   pedidos em aberto e sem guardar os valores antigos na auditoria).
 *
 * PRINCIPAIS ITENS:
 *   - adopter: adotante de exemplo.
 *   - setup({ openRequests }): cria o service com repository, auditoria e transação falsos.
 *   - 3 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/adopters/adopter-service.js (createAdopterService).
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Fábrica do service (permite injetar dependências falsas).
const { createAdopterService } = require('../../src/modules/adopters/adopter-service');

// Adotante de exemplo.
const adopter = {
  id: 'adotante-1',
  nome: 'Ana Souza',
  email: 'ana.souza@example.org',
  telefone: '(11) 98888-7777',
  cidade: 'Campinas',
  estado: 'SP',
  endereco: 'Rua das Flores, 10',
  status: 'em_analise',
  criado_em: '2026-09-01T12:00:00.000Z',
};

/*
 * FUNÇÃO: setup
 * O que faz: monta o service com dublês:
 *   - repository falso (devolve o adotante de exemplo e registra chamadas em "calls");
 *   - auditoria falsa (guarda os eventos em "audits");
 *   - transação falsa (só executa a função com um "db" de mentira: 'tx').
 * Parâmetros: { openRequests } — quantos pedidos em aberto simular.
 * Retorno: { service, audits, calls }.
 */
function setup({ openRequests = 0 } = {}) {
  const audits = [];
  const calls = [];
  const repository = {
    ANONYMIZED_NAME: 'Titular anonimizado',
    list: async () => ({ items: [{ ...adopter, total_pedidos: 1, pedidos_abertos: openRequests }], total: 1 }),
    findById: async () => ({ ...adopter }),
    findHistory: async () => ({
      pedidos: [{ id: 'pedido-1', status: 'novo', observacoes: 'Telefone informado: (11) 98888-7777' }],
      doacoes: [{ id: 'doacao-1', doador_email: 'ana.souza@example.org', valor: '50.00' }],
      historias: [],
    }),
    countOpenRequests: async () => openRequests,
    anonymize: async (db, id) => calls.push(['anonymize', id]),
    remove: async (db, id) => calls.push(['remove', id]),
  };
  const service = createAdopterService(repository, {
    audit: { record: async (event) => audits.push(event) },
    transaction: (work) => work('tx'),
  });
  return { service, audits, calls };
}

// Teste 1: lista e detalhe mascaram e-mail/telefone, omitem o endereço e limpam as observações.
test('adopter contacts are masked by default, including inside request notes', async () => {
  const { service } = setup();

  const { items } = await service.list({});
  assert.equal(items[0].email, 'an***@example.org');
  assert.equal(items[0].telefone, '*******7777');
  // O endereço não aparece na lista.
  assert.equal(Object.hasOwn(items[0], 'endereco'), false);

  const detail = await service.getById('adotante-1');
  assert.equal(detail.possui_endereco, true);
  // doesNotMatch: o telefone completo NÃO pode aparecer nas observações.
  assert.doesNotMatch(detail.historico.pedidos[0].observacoes, /98888-7777/);
  assert.equal(detail.historico.doacoes[0].doador_email, 'an***@example.org');
});

// Teste 2: revelar devolve os dados completos e grava auditoria "revelar_contato".
test('revealing contacts returns full data and is audited', async () => {
  const { service, audits } = setup();
  const revealed = await service.reveal('adotante-1', { userId: 'u1' });

  assert.equal(revealed.email, adopter.email);
  assert.equal(revealed.endereco, adopter.endereco);
  assert.equal(audits[0].action, 'revelar_contato');
});

// Teste 3: com pedido aberto, anonimizar falha (409) sem mexer em nada; sem pedido, anonimiza
// e a auditoria não guarda os valores antigos ("before" indefinido).
test('anonymization is blocked while there are open requests and never audits the old values', async () => {
  const blocked = setup({ openRequests: 1 });
  // assert.rejects: espera que a Promise falhe com um erro que tenha estes campos.
  await assert.rejects(blocked.service.anonymize('adotante-1', {}), { status: 409, code: 'PEDIDOS_EM_ANDAMENTO' });
  assert.equal(blocked.calls.length, 0);

  const { service, audits, calls } = setup();
  await service.anonymize('adotante-1', {});
  assert.deepEqual(calls, [['anonymize', 'adotante-1']]);
  assert.equal(audits[0].action, 'lgpd_anonimizar');
  assert.equal(audits[0].before, undefined);
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   setup() cria o service com dependências falsas; cada teste chama uma
 *   operação e confere o resultado, as chamadas feitas e os eventos de auditoria.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testar regras de privacidade (LGPD) com dados de exemplo.
 *   - assert.rejects para Promises que devem falhar.
 *   - Registrar chamadas em arrays para verificar efeitos colaterais.
 * ============================================================================
 */
