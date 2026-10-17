/*
 * ============================================================================
 * ARQUIVO: csrf.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Proteção contra CSRF (Cross-Site Request Forgery, "falsificação de
 *   requisição entre sites"). Nesse ataque, um site malicioso faz o navegador
 *   da vítima enviar uma requisição para a nossa API, aproveitando o cookie de
 *   sessão que o navegador já tem. A defesa aqui: exigir o cabeçalho
 *   "X-Requested-With: XMLHttpRequest", que formulários comuns de outros sites
 *   não conseguem enviar.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - requireAjaxHeader(req, res, next): o middleware (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../utils/app-error.
 *   - Usado por: modules/auth/auth-routes.js (rotas que usam o cookie: refresh e logout).
 *   - No frontend, o cliente HTTP (axios) envia esse cabeçalho.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../utils/app-error');

/*
 * FUNÇÃO: requireAjaxHeader (middleware)
 * O que faz: recusa (403) requisições sem o cabeçalho X-Requested-With: XMLHttpRequest.
 * Parâmetros: req, res, next.
 * Retorno: next() se o cabeçalho estiver correto; next(AppError 403) caso contrário.
 */
// Rotas que leem o cookie de sessão exigem um cabeçalho que formulários de outros sites não
// conseguem enviar; requisições de outras origens com ele passam pelo CORS, que só aceita
// as origens configuradas. Junto com SameSite=Strict, isso bloqueia CSRF.
function requireAjaxHeader(req, res, next) {
  // req.get(nome) lê um cabeçalho da requisição (sem diferenciar maiúsculas no nome).
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return next(new AppError(403, 'CSRF_INVALIDO', 'Requisição recusada por segurança. Atualize a página e tente novamente.'));
  }
  return next();
}

// Exporta a função diretamente.
module.exports = requireAjaxHeader;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Nas rotas que dependem do cookie de sessão, este middleware roda antes do
 *   controller: sem o cabeçalho especial, responde 403 CSRF_INVALIDO. Para
 *   enviar o cabeçalho de outro site, o navegador faria uma checagem prévia
 *   (preflight) de CORS, que só autoriza as origens configuradas.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Ataques CSRF e defesas (cabeçalho personalizado, SameSite, tokens anti-CSRF).
 *   - CORS e requisições "preflight" (OPTIONS).
 *   - Cookies SameSite=Strict.
 * ============================================================================
 */
