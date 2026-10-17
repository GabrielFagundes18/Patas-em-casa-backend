/*
 * ============================================================================
 * ARQUIVO: donation-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do donation-service: valores convertidos em número e e-mail
 *   mascarado nas listas, resumo e série mensal convertidos, doação cancelada
 *   não pode ser editada e mudança de status é auditada.
 *
 * PRINCIPAIS ITENS:
 *   - donation: doação de exemplo (valor como texto, como vem do PostgreSQL).
 *   - setup(current): service com repository e auditoria falsos.
 *   - 3 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/donations/donation-service.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Fábrica do service.
const { createDonationService } = require('../../src/modules/donations/donation-service');

// Doação de exemplo.
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

/*
 * FUNÇÃO: setup
 * O que faz: cria o service com um repository falso baseado em "current" (a doação atual) e
 *   uma auditoria que guarda os eventos.
 * Retorno: { service, audits }.
 */
function setup(current = donation) {
  const audits = [];
  const repository = {
    list: async () => ({ items: [current], total: 1 }),
    findById: async () => ({ ...current }),
    // update devolve a doação com as mudanças aplicadas (valor sempre como texto, como o banco).
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

// Teste 1: lista → valor numérico e e-mail mascarado; detalhe → e-mail completo.
test('donation values are numbers and donor e-mails are masked in lists', async () => {
  const { service } = setup();
  const { items } = await service.list({});
  assert.equal(items[0].valor, 80);
  assert.equal(items[0].doador_email, 'ru***@example.org');
  assert.equal((await service.getById('doacao-1')).doador_email, 'rui.lima@example.org');
});

// Teste 2: resumo e série mensal convertem os textos do banco em números; o mês vira "AAAA-MM".
test('summary and monthly series convert database numerics', async () => {
  const { service } = setup();
  const summary = await service.summary({});
  assert.equal(summary.total_confirmado, 130);
  assert.equal(summary.arrecadado_mes_atual, 50);
  assert.deepEqual(summary.por_metodo, [{ chave: 'pix', quantidade: 2, total: 130 }]);
  assert.deepEqual(await service.monthly({}), [{ mes: '2026-08', total: 400, quantidade: 4 }]);
});

// Teste 3: cancelada → 409 ao editar; mudar o status de uma confirmada → auditoria "alterar_status".
test('cancelled donations are final and status changes are audited', async () => {
  const cancelled = setup({ ...donation, status: 'cancelada' });
  await assert.rejects(cancelled.service.update('doacao-1', { status: 'confirmada' }, {}), { status: 409, code: 'DOACAO_CANCELADA' });

  const { service, audits } = setup();
  await service.update('doacao-1', { status: 'cancelada' }, {});
  assert.equal(audits[0].action, 'alterar_status');
  assert.deepEqual(audits[0].after, { status: 'cancelada' });
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   setup() monta o service com dados fixos; os testes conferem conversões,
 *   mascaramento, regra de doação cancelada e auditoria.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Por que valores numeric do PostgreSQL chegam como texto no Node.
 *   - Testar regras de negócio que bloqueiam edições.
 * ============================================================================
 */
