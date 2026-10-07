const assert = require('node:assert/strict');
const test = require('node:test');
const { createDashboardService } = require('../src/modules/dashboard/dashboard-service');

function setup() {
  let calls = 0;
  const repository = {
    publicNumbers: async () => ({ total_animais: '11', total_adocoes: '4', aguardando_lar: '6' }),
    kpis: async () => { calls += 1; return { total_animais: '10', total_adocoes: '4', pedidos_pendentes: '3', doacoes_mes_atual: '120.50' }; },
    animalsByStatus: async () => [{ status: 'disponivel', total: 4 }, { status: 'urgente', total: 2 }, { status: 'adotado', total: 4 }],
    animalHealth: async () => ({ total: 10, vacinados: 9, castrados: 8, adotados: 4 }),
    requestsByStatus: async () => [{ status: 'novo', total: 3 }],
    adoptionsByMonth: async () => [{ mes: new Date('2026-08-01T00:00:00.000Z'), total: 2 }],
    adoptionTotals: async () => ({ mes: 1, ano: 2 }),
    donationsByMonth: async () => [{ mes: new Date('2026-10-01T00:00:00.000Z'), total: '120.50', quantidade: '2' }],
    donationsByMethod: async () => [{ metodo: 'pix', quantidade: 2, total: '120.50' }],
    urgentAnimals: async () => [],
    recentRequests: async () => [],
    agenda: async () => [],
  };
  const service = createDashboardService(repository, { now: () => new Date('2026-10-04T12:00:00.000Z') });
  return { service, calls: () => calls };
}

test('dashboard summary fills a 12-month series and computes indicators', async () => {
  const { service } = setup();
  const summary = await service.summary();

  assert.equal(summary.series_mensais.length, 12);
  assert.equal(summary.series_mensais[0].mes, '2025-11');
  assert.deepEqual(summary.series_mensais.at(-1), { mes: '2026-10', adocoes: 0, doacoes_total: 120.5, doacoes_quantidade: 2 });
  assert.equal(summary.series_mensais.find((month) => month.mes === '2026-08').adocoes, 2);
  assert.equal(summary.indicadores.animais_sob_cuidado, 6);
  assert.equal(summary.indicadores.arrecadado_mes, 120.5);
  assert.equal(summary.animais.saude.percentual_vacinados, 90);
});

test('dashboard summary is cached briefly unless a fresh read is requested', async () => {
  const { service, calls } = setup();
  await service.summary();
  await service.summary();
  assert.equal(calls(), 1);
  await service.summary({ fresh: true });
  assert.equal(calls(), 2);
});

test('public stats expose only aggregated numbers', async () => {
  const { service } = setup();
  assert.deepEqual(await service.publicStats(), { animais_resgatados: 11, adocoes_realizadas: 4, aguardando_lar: 6 });
});
