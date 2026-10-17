/*
 * ============================================================================
 * ARQUIVO: pagination.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Lê e valida os parâmetros de PAGINAÇÃO das listagens (?page=2&pageSize=20)
 *   e calcula o "offset" (quantos registros pular) usado no SQL
 *   ("LIMIT pageSize OFFSET offset"). Também limita o tamanho máximo da página
 *   para ninguém pedir 1 milhão de registros de uma vez.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - parsePositiveInteger(value, field, fallback): valida um inteiro positivo (interna).
 *   - parsePagination(query): devolve { page, pageSize, offset } (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./app-error.
 *   - Usado por: ./validators.js (listQueryDetails) e pelos services/repositories de listagem.
 * ============================================================================
 */

// Classe de erro da aplicação.
const AppError = require('./app-error');

// Página padrão, tamanho padrão e tamanho máximo da página.
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/*
 * FUNÇÃO: parsePositiveInteger (interna)
 * O que faz: converte o valor em inteiro maior que zero.
 * Parâmetros:
 *   - value (string | undefined): valor vindo da URL.
 *   - field (string): nome do parâmetro (para a mensagem de erro).
 *   - fallback (number): valor usado quando o parâmetro não veio.
 * Retorno (number). Lança AppError 400 se o valor for inválido (ex.: "abc", "0", "-3", "1.5").
 */
function parsePositiveInteger(value, field, fallback) {
  // Parâmetro ausente ou vazio: usa o padrão.
  if (value === undefined || value === '') return fallback;

  const parsedValue = Number(value);
  // isSafeInteger: inteiro dentro do limite seguro do JavaScript (evita números gigantes imprecisos).
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new AppError(400, 'PARAMETRO_INVALIDO', `O parâmetro ${field} deve ser um inteiro positivo.`, [
      { field, message: 'Informe um inteiro maior que zero.' },
    ]);
  }

  return parsedValue;
}

/*
 * FUNÇÃO: parsePagination
 * O que faz: lê page e pageSize da query string e calcula o offset.
 * Parâmetros: query (objeto, opcional) — normalmente req.query.
 * Retorno (objeto): { page, pageSize, offset }.
 *   Ex.: { page: '3', pageSize: '20' } → { page: 3, pageSize: 20, offset: 40 }.
 */
function parsePagination(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE);
  const requestedPageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE);
  // Nunca passa de 100 itens por página (pedidos maiores são reduzidos, sem erro).
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  // Registros a pular: página 1 → 0; página 2 → pageSize; página 3 → 2 × pageSize...
  const offset = (page - 1) * pageSize;

  // Página absurda (ex.: 999999999999999) geraria um offset impreciso: recusa.
  if (!Number.isSafeInteger(offset)) {
    throw new AppError(400, 'PARAMETRO_INVALIDO', 'A página solicitada está fora do limite permitido.', [
      { field: 'page', message: 'Informe uma página menor.' },
    ]);
  }

  return { page, pageSize, offset };
}

// Exporta a função e o tamanho máximo.
module.exports = { parsePagination, MAX_PAGE_SIZE };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   parsePagination recebe req.query, valida page e pageSize (inteiros positivos),
 *   limita pageSize a 100 e calcula offset = (page - 1) × pageSize, que o
 *   repository usa em "LIMIT ... OFFSET ...".
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Paginação com LIMIT/OFFSET no SQL.
 *   - Query string (?chave=valor) e req.query no Express.
 *   - Number.isSafeInteger e limites numéricos do JavaScript.
 *   - Validar entradas e responder 400 (Bad Request) com detalhes.
 * ============================================================================
 */
