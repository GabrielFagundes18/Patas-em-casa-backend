/*
 * ============================================================================
 * ARQUIVO: health-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Responde às rotas de "SAÚDE" da API, usadas por pessoas e por plataformas
 *   de hospedagem para saber se o serviço está no ar:
 *     - GET /        → informações básicas da API (nome, versão, modo).
 *     - GET /health  → "estou vivo" (o processo responde).
 *     - GET /ready   → "estou pronto" (o banco de dados também responde).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - getApiInfo, checkHealth, checkReadiness.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/connection-check (testConnection).
 *   - Usado por: ./health-routes.js.
 * ============================================================================
 */

// Função que testa a conexão com o banco.
const { testConnection } = require('../../db/connection-check');

/*
 * FUNÇÃO: getApiInfo (controller)
 * O que faz: devolve nome, versão e modo (ambiente) da API.
 * Parâmetros: req, res (padrão do Express).
 * Retorno: resposta JSON.
 * Obs.: "exports.nome = ..." é outra forma de exportar várias funções no CommonJS.
 */
exports.getApiInfo = (req, res) => {
  return res.json({
    ok: true,
    name: 'Patas em Casa API',
    version: '1.0.0',
    // Ambiente (development, test ou production).
    mode: process.env.NODE_ENV || 'development',
  });
};

/*
 * FUNÇÃO: checkHealth (controller)
 * O que faz: confirma que o processo está respondendo ("liveness").
 * Retorno: JSON { ok, status: 'ok', timestamp }.
 */
exports.checkHealth = (req, res) => {
  return res.json({
    ok: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};

/*
 * FUNÇÃO: checkReadiness (controller async)
 * O que faz: testa o banco e diz se a API está pronta para atender ("readiness").
 * Retorno: 200 { status: 'ready' } se o banco respondeu; 503 { status: 'not-ready' } se não.
 *   503 = "Serviço indisponível" (a plataforma pode esperar antes de mandar tráfego).
 */
exports.checkReadiness = async (req, res) => {
  try {
    const status = await testConnection();
    // Sem banco configurado (modo mock), status.ok é false → 503.
    return res.status(status.ok ? 200 : 503).json({
      ok: status.ok,
      status: status.ok ? 'ready' : 'not-ready',
      // 'database' ou 'mock'.
      database: status.mode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // O banco não respondeu após as tentativas: indisponível.
    return res.status(503).json({
      ok: false,
      status: 'not-ready',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   "/" e "/health" respondem na hora; "/ready" testa o banco (com novas
 *   tentativas) e responde 200 ou 503 conforme o resultado.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Health checks: liveness x readiness.
 *   - Status 200 x 503.
 *   - Exportar funções com "exports.nome".
 *   - async/await com try/catch em controllers.
 * ============================================================================
 */
