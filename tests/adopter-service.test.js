const assert = require('node:assert/strict');
const test = require('node:test');
const { createAdopterService } = require('../src/modules/adopters/adopter-service');

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

test('adopter contacts are masked by default, including inside request notes', async () => {
  const { service } = setup();

  const { items } = await service.list({});
  assert.equal(items[0].email, 'an***@example.org');
  assert.equal(items[0].telefone, '*******7777');
  assert.equal(Object.hasOwn(items[0], 'endereco'), false);

  const detail = await service.getById('adotante-1');
  assert.equal(detail.possui_endereco, true);
  assert.doesNotMatch(detail.historico.pedidos[0].observacoes, /98888-7777/);
  assert.equal(detail.historico.doacoes[0].doador_email, 'an***@example.org');
});

test('revealing contacts returns full data and is audited', async () => {
  const { service, audits } = setup();
  const revealed = await service.reveal('adotante-1', { userId: 'u1' });

  assert.equal(revealed.email, adopter.email);
  assert.equal(revealed.endereco, adopter.endereco);
  assert.equal(audits[0].action, 'revelar_contato');
});

test('anonymization is blocked while there are open requests and never audits the old values', async () => {
  const blocked = setup({ openRequests: 1 });
  await assert.rejects(blocked.service.anonymize('adotante-1', {}), { status: 409, code: 'PEDIDOS_EM_ANDAMENTO' });
  assert.equal(blocked.calls.length, 0);

  const { service, audits, calls } = setup();
  await service.anonymize('adotante-1', {});
  assert.deepEqual(calls, [['anonymize', 'adotante-1']]);
  assert.equal(audits[0].action, 'lgpd_anonimizar');
  assert.equal(audits[0].before, undefined);
});
