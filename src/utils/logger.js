/*
 * ============================================================================
 * ARQUIVO: logger.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Registra LOGS (eventos do sistema) em formato JSON, uma linha por evento,
 *   na saída padrão (stdout). Plataformas de hospedagem coletam essa saída.
 *   Por causa da LGPD, só passam informações técnicas de uma lista permitida
 *   (ids, método, status...). Dados pessoais (nome, e-mail, telefone) nunca
 *   entram no log, mesmo que alguém os envie por engano.
 *
 * PRINCIPAIS ITENS:
 *   - ALLOWED_CONTEXT_KEYS: campos permitidos no log.
 *   - write(level, event, context): grava uma linha (interna).
 *   - Exporta { info, error }.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: server.js, db/pool.js, middlewares (request-context, error-handler),
 *     integrações e services.
 * ============================================================================
 */

// Somente identificadores técnicos entram no log; nenhum dado pessoal (LGPD).
// Lista de chaves permitidas (Set = busca rápida com .has()).
const ALLOWED_CONTEXT_KEYS = new Set([
  // Id único da requisição (para seguir um pedido nos logs).
  'requestId',
  // Método HTTP (GET, POST...).
  'method',
  // Status da resposta (200, 404...).
  'statusCode',
  // Quanto tempo a requisição levou.
  'durationMs',
  // Código de erro.
  'code',
  // Id (não o nome) de quem fez a ação.
  'userId',
  // Dados de auditoria: ação, módulo, entidade e id da entidade.
  'action',
  'module',
  'entity',
  'entityId',
  // Porta e sinal (início e desligamento do servidor).
  'port',
  'signal',
]);

/*
 * FUNÇÃO: write (interna)
 * O que faz: filtra o contexto e escreve uma linha JSON no stdout.
 * Parâmetros:
 *   - level (string): 'info' ou 'error'.
 *   - event (string): nome do evento (ex.: 'api_started').
 *   - context (objeto, opcional): dados extras; só ficam as chaves permitidas com valor texto ou número.
 * Retorno: nada.
 */
function write(level, event, context = {}) {
  // Mantém só as chaves permitidas e só valores do tipo string ou number
  // (objetos poderiam esconder dados pessoais dentro deles).
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([key, value]) =>
      ALLOWED_CONTEXT_KEYS.has(key) && ['string', 'number'].includes(typeof value)
    )
  );

  // JSON.stringify converte o objeto em texto JSON. "...safeContext" espalha os campos filtrados.
  // process.stdout.write escreve na saída padrão; "\n" termina a linha.
  process.stdout.write(`${JSON.stringify({
    // Data/hora no formato ISO (UTC).
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeContext,
  })}\n`);
}

// Exporta duas funções curtas: logger.info(...) e logger.error(...).
module.exports = {
  info: (event, context) => write('info', event, context),
  error: (event, context) => write('error', event, context),
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   logger.info('evento', { ... }) → write filtra o contexto pela lista permitida →
 *   escreve {"timestamp":...,"level":"info","event":"evento",...} numa linha.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Logs estruturados (JSON por linha) e níveis de log.
 *   - LGPD: minimização de dados e não registrar dados pessoais.
 *   - Lista de permissões (allowlist) em vez de lista de proibições.
 *   - typeof, Object.entries/fromEntries, filter e o operador spread (...).
 * ============================================================================
 */
