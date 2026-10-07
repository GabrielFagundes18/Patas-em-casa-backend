const assert = require('node:assert/strict');
const test = require('node:test');
const { createDonationService } = require('../../src/modules/donations/donation-service');

const donation = {
  id: 'doacao-1',
  adotante_id: null,
  adotante_nome: null,
  doador_nome: 'Rui',
  doador_email: 'rui.lima@example.org',
  tipo: 'unica',
  valor: '80.00',
  metodo: 'pix',
  status: 'confirmada',
  data: '2026-08-10T12:00:00.000Z',
};

function setup(current = donation) {
  const audits = [];
  const repository = {
    list: async () => ({ items: [current], total: 1 }),
    findById: async () => ({ ...current }),
    update: async (id, changes) => ({ ...current, ...changes, valor: String(changes.valor ?? current.valor) }),
    summary: async () => ({
      byStatus: [{ chave: 'confirmada', quantidade: 2, total: '130.00' }],
      byMethod: [{ chave: 'pix', quantidade: 2, total: '130.00' }],
      byType: [{ chave: 'unica', quantidade: 2, total: '130.00' }],
    }),
    kpis: async () => ({ doacoes_mes_atual: '50.00' }),
    monthly: async () => [{ mes: new Date('2026-08-01T00:00:00.000Z'), total: '400.00', quantidade: '4' }],
  };
  const service = createDonationService(repository, { audit: { record: async (event) => audits.push(event) } });
  return { service, audits };
}

test('donation values are numbers and donor e-mails are masked in lists', async () => {
  const { service } = setup();
  const { items } = await service.list({});
  assert.equal(items[0].valor, 80);
  assert.equal(items[0].doador_email, 'ru***@example.org');
  assert.equal((await service.getById('doacao-1')).doador_email, 'rui.lima@example.org');
});

test('summary and monthly series convert database numerics', async () => {
  const { service } = setup();
  const summary = await service.summary({});
  assert.equal(summary.total_confirmado, 130);
  assert.equal(summary.arrecadado_mes_atual, 50);
  assert.deepEqual(summary.por_metodo, [{ chave: 'pix', quantidade: 2, total: 130 }]);
  assert.deepEqual(await service.monthly({}), [{ mes: '2026-08', total: 400, quantidade: 4 }]);
});

test('cancelled donations are final and status changes are audited', async () => {
  const cancelled = setup({ ...donation, status: 'cancelada' });
  await assert.rejects(cancelled.service.update('doacao-1', { status: 'confirmada' }, {}), { status: 409, code: 'DOACAO_CANCELADA' });

  const { service, audits } = setup();
  await service.update('doacao-1', { status: 'cancelada' }, {});
  assert.equal(audits[0].action, 'alterar_status');
  assert.deepEqual(audits[0].after, { status: 'cancelada' });
});
