/*
 * ============================================================================
 * ARQUIVO: http-response.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Padroniza o FORMATO DAS RESPOSTAS JSON da API, para que o frontend sempre
 *   saiba onde encontrar as informações:
 *     - sucesso:  { data: ..., meta: {...} }
 *     - lista:    { data: [...], meta: { page, pageSize, total, totalPages } }
 *     - erro:     { error: { code, message, details } }
 *
 * PRINCIPAIS FUNÇÕES:
 *   - successResponse(data, meta), listResponse(items, total, page, pageSize),
 *     errorResponse(code, message, details).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: todos os controllers (sucesso/lista) e middleware/error-handler.js (erro).
 *   - No frontend, api/client.js e os services leem "data", "meta" e "error".
 * ============================================================================
 */

/*
 * FUNÇÃO: successResponse
 * O que faz: embrulha o resultado no formato padrão de sucesso.
 * Parâmetros: data (qualquer tipo) — o conteúdo; meta (objeto, opcional) — informações extras.
 * Retorno (objeto): { data, meta }.
 */
function successResponse(data, meta = {}) {
  // { data, meta } é atalho para { data: data, meta: meta }.
  return { data, meta };
}

/*
 * FUNÇÃO: listResponse
 * O que faz: formato de resposta para listas paginadas.
 * Parâmetros:
 *   - items (array): itens da página atual.
 *   - total (number): total de itens em todas as páginas.
 *   - page (number) e pageSize (number): página atual e tamanho da página.
 * Retorno (objeto): { data: items, meta: { page, pageSize, total, totalPages } }.
 */
function listResponse(items, total, page, pageSize) {
  return successResponse(items, {
    page,
    pageSize,
    total,
    // Math.ceil arredonda para cima: 45 itens com 20 por página = 3 páginas.
    totalPages: Math.ceil(total / pageSize),
  });
}

/*
 * FUNÇÃO: errorResponse
 * O que faz: formato padrão de erro.
 * Parâmetros: code (string), message (string), details (array, opcional).
 * Retorno (objeto): { error: { code, message, details } }.
 */
function errorResponse(code, message, details = []) {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

// Exporta as três funções.
module.exports = { successResponse, listResponse, errorResponse };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Os controllers fazem res.json(successResponse(...)) ou res.json(listResponse(...));
 *   o error-handler faz res.status(x).json(errorResponse(...)). Assim todas as
 *   respostas da API têm o mesmo "envelope".
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Contrato de API e respostas padronizadas ("envelope").
 *   - Paginação: page, pageSize, total e totalPages.
 *   - Atalho de propriedades em objetos ({ data, meta }) e parâmetros padrão.
 * ============================================================================
 */
