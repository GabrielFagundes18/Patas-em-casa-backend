/*
 * ============================================================================
 * ARQUIVO: dashboard-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do dashboard-service: série de 12 meses sem buracos, indicadores
 *   calculados, cache curto (com opção de forçar atualização) e números públicos.
 *
 * PRINCIPAIS ITENS:
 *   - setup(): repository falso + relógio fixo (4/out/2026); conta as chamadas de kpis.
 *   - 3 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/dashboard/dashboard-service.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Fábrica do service.
const { createDashboardService } = require('../../src/modules/dashboard/dashboard-service');

/*
 * FUNÇÃO: setup
 * O que faz: cria o service com um repository falso (valores fixos, alguns como texto, como o
 *   PostgreSQL devolveria) e um relógio fixo. "calls" conta quantas vezes kpis() foi chamada
 *   (serve para testar o cache).
 * Retorno: { service, calls (função que lê o contador) }.
 */
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

// Teste 1: 12 meses (nov/2025 a out/2026), meses sem dados com 0, textos convertidos em número e porcentagens.
test('dashboard summary fills a 12-month series and computes indicators', async () => {
  const { service } = setup();
  const summary = await service.summary();

  assert.equal(summary.series_mensais.length, 12);
  assert.equal(summary.series_mensais[0].mes, '2025-11');
  // .at(-1) = último item do array.
  assert.deepEqual(summary.series_mensais.at(-1), { mes: '2026-10', adocoes: 0, doacoes_total: 120.5, doacoes_quantidade: 2 });
  assert.equal(summary.series_mensais.find((month) => month.mes === '2026-08').adocoes, 2);
  // Sob cuidado = disponível (4) + urgente (2).
  assert.equal(summary.indicadores.animais_sob_cuidado, 6);
  assert.equal(summary.indicadores.arrecadado_mes, 120.5);
  // 9 de 10 vacinados = 90%.
  assert.equal(summary.animais.saude.percentual_vacinados, 90);
});

// Teste 2: a segunda chamada usa o cache (kpis chamada 1 vez); fresh: true força nova consulta.
test('dashboard summary is cached briefly unless a fresh read is requested', async () => {
  const { service, calls } = setup();
  await service.summary();
  await service.summary();
  assert.equal(calls(), 1);
  await service.summary({ fresh: true });
  assert.equal(calls(), 2);
});

// Teste 3: números públicos convertidos em número e só agregados.
test('public stats expose only aggregated numbers', async () => {
  const { service } = setup();
  assert.deepEqual(await service.publicStats(), { animais_resgatados: 11, adocoes_realizadas: 4, aguardando_lar: 6 });
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   setup() fornece dados fixos e um relógio fixo; os testes conferem a série
 *   mensal, os cálculos, o comportamento do cache e os números públicos.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Relógio fixo (injeção de "now") para testes previsíveis com datas.
 *   - Testar cache contando chamadas.
 *   - Array.prototype.at e find.
 * ============================================================================
 */
