const dashboardRepository = require('./dashboard-repository');

const CACHE_TTL_MS = 15000;
const SERIES_MONTHS = 12;
const LIST_LIMIT = 5;
const AGENDA_LIMIT = 10;
const UNDER_CARE_STATUSES = ['disponivel', 'em_processo', 'urgente'];

function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function monthKey(value) {
  return new Date(value).toISOString().slice(0, 7);
}

// Últimos N meses (AAAA-MM), incluindo o atual, para séries sem buracos nos gráficos.
function lastMonths(count, now) {
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

function createDashboardService(repository = dashboardRepository, { now = () => new Date() } = {}) {
  let cache = null;

  async function build() {
    const [
      kpis, byStatus, health, requestsByStatus, adoptionsByMonth, adoptionTotals,
      donationsByMonth, donationsByMethod, urgent, recent, agenda,
    ] = await Promise.all([
      repository.kpis(),
      repository.animalsByStatus(),
      repository.animalHealth(),
      repository.requestsByStatus(),
      repository.adoptionsByMonth(SERIES_MONTHS),
      repository.adoptionTotals(),
      repository.donationsByMonth(SERIES_MONTHS),
      repository.donationsByMethod(SERIES_MONTHS),
      repository.urgentAnimals(LIST_LIMIT),
      repository.recentRequests(LIST_LIMIT),
      repository.agenda(AGENDA_LIMIT),
    ]);

    const months = lastMonths(SERIES_MONTHS, now());
    const adoptionsMap = new Map(adoptionsByMonth.map((row) => [monthKey(row.mes), Number(row.total)]));
    const donationsMap = new Map(donationsByMonth.map((row) => [monthKey(row.mes), row]));
    const total = Number(health.total);

    return {
      atualizado_em: now().toISOString(),
      indicadores: {
        total_animais: Number(kpis.total_animais),
        animais_sob_cuidado: byStatus
          .filter((row) => UNDER_CARE_STATUSES.includes(row.status))
          .reduce((sum, row) => sum + row.total, 0),
        adocoes_mes: adoptionTotals.mes,
        adocoes_ano: adoptionTotals.ano,
        total_adocoes: Number(kpis.total_adocoes),
        arrecadado_mes: Number(kpis.doacoes_mes_atual),
        pedidos_pendentes: Number(kpis.pedidos_pendentes),
      },
      animais: {
        por_status: byStatus,
        saude: {
          total,
          vacinados: health.vacinados,
          castrados: health.castrados,
          adotados: health.adotados,
          percentual_vacinados: percent(health.vacinados, total),
          percentual_castrados: percent(health.castrados, total),
          percentual_adotados: percent(health.adotados, total),
        },
        urgentes: urgent,
      },
      pedidos: {
        por_status: requestsByStatus,
        recentes: recent.map((row) => ({
          id: row.id,
          status: row.status,
          prioridade: row.prioridade,
          data_pedido: row.data_pedido,
          animal: { id: row.animal_id, nome: row.animal_nome },
          adotante_nome: row.adotante_nome,
        })),
      },
      doacoes: {
        por_metodo: donationsByMethod.map((row) => ({
          metodo: row.metodo,
          quantidade: row.quantidade,
          total: Number(row.total),
        })),
      },
      series_mensais: months.map((month) => ({
        mes: month,
        adocoes: adoptionsMap.get(month) || 0,
        doacoes_total: Number(donationsMap.get(month)?.total || 0),
        doacoes_quantidade: Number(donationsMap.get(month)?.quantidade || 0),
      })),
      agenda: agenda.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        pedido_id: row.pedido_id,
        referencia_em: row.referencia_em,
        animal_nome: row.animal_nome,
        adotante_nome: row.adotante_nome,
        responsavel_nome: row.responsavel_nome,
      })),
    };
  }

  // Cache curto: o painel pode atualizar sozinho sem refazer todas as consultas a cada acesso.
  async function summary({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
    const data = await build();
    cache = { at: Date.now(), data };
    return data;
  }

  async function publicStats() {
    const numbers = await repository.publicNumbers();
    return {
      animais_resgatados: Number(numbers.total_animais),
      adocoes_realizadas: Number(numbers.total_adocoes),
      aguardando_lar: Number(numbers.aguardando_lar),
    };
  }

  return { summary, publicStats };
}

module.exports = { ...createDashboardService(), createDashboardService };
