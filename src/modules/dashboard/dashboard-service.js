/*
 * ============================================================================
 * ARQUIVO: dashboard-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE do PAINEL INICIAL. Executa todas as consultas do dashboard em
 *   paralelo e monta um único objeto com: indicadores, animais (por status,
 *   saúde, urgentes), pedidos (por status, recentes), doações por forma de
 *   pagamento, séries dos últimos 12 meses e agenda. Guarda o resultado num
 *   CACHE de 15 segundos. Também calcula os números públicos do site.
 *
 * PRINCIPAIS ITENS:
 *   - CACHE_TTL_MS, SERIES_MONTHS, LIST_LIMIT, AGENDA_LIMIT, UNDER_CARE_STATUSES.
 *   - percent, monthKey, lastMonths (auxiliares).
 *   - createDashboardService(repository, { now }) (exportada): { summary, publicStats }.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./dashboard-repository.
 *   - Usado por: ./dashboard-controller.js e modules/public/public-controller.js (getStats).
 *   - Testado em: tests/unit/dashboard-service.test.js.
 * ============================================================================
 */

// Consultas do painel.
const dashboardRepository = require('./dashboard-repository');

// Tempo de vida do cache: 15 segundos.
const CACHE_TTL_MS = 15000;
// Meses nas séries dos gráficos.
const SERIES_MONTHS = 12;
// Itens nas listas curtas (urgentes, pedidos recentes).
const LIST_LIMIT = 5;
// Itens na agenda.
const AGENDA_LIMIT = 10;
// Status que contam como "sob cuidado" do abrigo.
const UNDER_CARE_STATUSES = ['disponivel', 'em_processo', 'urgente'];

/*
 * FUNÇÃO: percent
 * O que faz: porcentagem com 1 casa decimal. Ex.: percent(1, 3) → 33.3. Total 0 → 0 (evita divisão por zero).
 * Truque: × 1000, arredonda, ÷ 10 = arredondamento para 1 casa.
 */
function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/*
 * FUNÇÃO: monthKey
 * O que faz: data → "AAAA-MM" (chave do mês). Ex.: 2026-10-01T00:00:00Z → "2026-10".
 */
function monthKey(value) {
  return new Date(value).toISOString().slice(0, 7);
}

/*
 * FUNÇÃO: lastMonths
 * O que faz: lista os últimos "count" meses como "AAAA-MM", do mais antigo para o atual.
 * Parâmetros: count (number) e now (Date).
 * Detalhe: Date.UTC(ano, mês - offset, 1) — o JavaScript ajusta sozinho mês negativo para o ano anterior.
 */
// Últimos N meses (AAAA-MM), incluindo o atual, para séries sem buracos nos gráficos.
function lastMonths(count, now) {
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

/*
 * FUNÇÃO: createDashboardService (fábrica)
 * Parâmetros: repository (padrão) e { now } (relógio, para testes).
 * Retorno: { summary, publicStats }.
 */
function createDashboardService(repository = dashboardRepository, { now = () => new Date() } = {}) {
  // Cache em memória: { at: momento em que foi calculado, data: resultado } ou null.
  let cache = null;

  /*
   * build (async): faz todas as consultas e monta o resumo.
   */
  async function build() {
    // Promise.all executa as 11 consultas ao mesmo tempo; a desestruturação recebe os resultados
    // na mesma ordem da lista.
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

    // Meses da série e "mapas" mês → valor, para preencher meses sem dados com zero.
    const months = lastMonths(SERIES_MONTHS, now());
    const adoptionsMap = new Map(adoptionsByMonth.map((row) => [monthKey(row.mes), Number(row.total)]));
    const donationsMap = new Map(donationsByMonth.map((row) => [monthKey(row.mes), row]));
    const total = Number(health.total);

    // Number(...) converte valores que o PostgreSQL devolve como texto (ex.: somas numéricas e bigint).
    return {
      atualizado_em: now().toISOString(),
      indicadores: {
        total_animais: Number(kpis.total_animais),
        // Soma dos animais nos status "sob cuidado" (reduce acumula a soma linha a linha).
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
        // Reorganiza cada linha num objeto com "animal" aninhado.
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
      // Um item por mês, sempre 12 itens (meses sem dados = 0).
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

  /*
   * summary (async): devolve o resumo do cache, se ainda for "fresco" (menos de 15 s);
   * senão (ou com fresh: true), recalcula e guarda no cache.
   */
  // Cache curto: o painel pode atualizar sozinho sem refazer todas as consultas a cada acesso.
  async function summary({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
    const data = await build();
    cache = { at: Date.now(), data };
    return data;
  }

  /*
   * publicStats (async): números para o site (sem cache e sem dados pessoais).
   */
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

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createDashboardService(), createDashboardService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   summary() → cache válido? devolve. Senão, build(): 11 consultas em paralelo →
 *   conversões de tipo, porcentagens e séries de 12 meses sem buracos → guarda
 *   no cache por 15 s → devolve. publicStats() devolve só contagens agregadas.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Promise.all para paralelizar consultas independentes.
 *   - Cache em memória com tempo de expiração (TTL).
 *   - Map, reduce, filter e map para transformar dados.
 *   - Preencher séries temporais (meses sem dados = 0) para gráficos.
 *   - Datas em UTC (Date.UTC, getUTCMonth).
 * ============================================================================
 */
