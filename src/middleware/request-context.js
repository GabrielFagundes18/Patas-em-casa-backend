/*
 * ============================================================================
 * ARQUIVO: request-context.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Dá a cada requisição um IDENTIFICADOR ÚNICO (requestId) e registra no log,
 *   quando a resposta termina, o método, o status e quanto tempo levou. O id
 *   também volta para quem chamou no cabeçalho "X-Request-Id", o que ajuda a
 *   encontrar nos logs uma requisição específica que deu problema.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - requestContext(req, res, next): o middleware (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto (randomUUID) e ../utils/logger.
 *   - Registrado em src/app.js; o error-handler usa req.requestId no log.
 * ============================================================================
 */

// randomUUID gera um identificador único aleatório (ex.: "3b241101-e2bb-4255-8caf-4136c566a962").
const { randomUUID } = require('node:crypto');
// Logs.
const logger = require('../utils/logger');

/*
 * FUNÇÃO: requestContext (middleware)
 * O que faz: cria o requestId, mede o tempo e registra o log ao final da resposta.
 * Parâmetros: req, res, next.
 * Retorno: o resultado de next() (passa para o próximo middleware).
 */
function requestContext(req, res, next) {
  // Id único desta requisição.
  const requestId = randomUUID();
  // Relógio de alta precisão (em nanossegundos, como BigInt) para medir a duração.
  const startedAt = process.hrtime.bigint();

  // Guarda o id na requisição (outros middlewares usam) e devolve no cabeçalho da resposta.
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // res.on('finish', ...) roda quando a resposta termina de ser enviada.
  res.on('finish', () => {
    // Diferença em nanossegundos → Number → milissegundos (1e6 = 1.000.000).
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('http_request', {
      requestId,
      method: req.method,
      statusCode: res.statusCode,
      // Arredonda para 2 casas decimais.
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  // Segue para o próximo middleware.
  return next();
}

// Exporta o middleware.
module.exports = requestContext;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   No início de cada requisição: gera o id, anota o horário e devolve o id no
 *   cabeçalho X-Request-Id. Quando a resposta termina ("finish"): calcula a
 *   duração e grava um log http_request.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Rastreamento de requisições (request id / correlation id).
 *   - Eventos no Node (res.on('finish')).
 *   - process.hrtime.bigint() e o tipo BigInt.
 *   - Observabilidade: logs com duração e status.
 * ============================================================================
 */
