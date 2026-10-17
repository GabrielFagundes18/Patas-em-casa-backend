/*
 * ============================================================================
 * ARQUIVO: dashboard-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER do PAINEL INICIAL (dashboard): devolve o resumo com indicadores,
 *   gráficos, listas e agenda. Com ?atualizar=true, ignora o cache e recalcula.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - summary (GET /api/v1/dashboard/summary).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./dashboard-service e utils/http-response.
 *   - Usado por: ./dashboard-routes.js.
 *   - No frontend: admin/dashboard (dashboardService, DashboardOverview).
 * ============================================================================
 */

// Regras do painel.
const dashboardService = require('./dashboard-service');
// Formato de resposta.
const { successResponse } = require('../../utils/http-response');

/*
 * FUNÇÃO: summary (controller async)
 * O que faz: devolve o resumo do painel. "fresh: true" (quando ?atualizar=true) pula o cache.
 */
exports.summary = async (req, res) => {
  return res.json(successResponse(await dashboardService.summary({ fresh: req.query.atualizar === 'true' })));
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   GET /dashboard/summary → (login + dashboard:read) → summary → service (com
 *   cache de 15 s) → JSON com todos os blocos do painel.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Endpoint de "resumo" que agrega várias consultas numa resposta só.
 *   - Parâmetro para forçar atualização e ignorar cache.
 * ============================================================================
 */
