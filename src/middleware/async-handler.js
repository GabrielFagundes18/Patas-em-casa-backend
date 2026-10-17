/*
 * ============================================================================
 * ARQUIVO: async-handler.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   O Express 4 NÃO captura sozinho os erros de funções "async" (que devolvem
 *   Promise). Se um controller async der erro e ninguém tratar, a requisição
 *   fica "pendurada" e o erro não chega ao error-handler. Este arquivo "embrulha"
 *   o controller: se a Promise for rejeitada, o erro é repassado com next(erro).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - asyncHandler(handler): devolve uma versão segura do handler (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado nos arquivos de rotas (modules/*\/...-routes.js) em volta dos controllers.
 *   - Os erros seguem para middleware/error-handler.js.
 * ============================================================================
 */

/*
 * FUNÇÃO: asyncHandler
 * O que faz: transforma um handler (possivelmente async) num middleware que nunca "perde" erros.
 * Parâmetros:
 *   - handler (função (req, res, next)): o controller original.
 * Retorno (função): o middleware "embrulhado" (wrappedHandler).
 * Exemplo de uso: router.get('/animals', asyncHandler(controller.list));
 */
function asyncHandler(handler) {
  // Devolve uma nova função com a mesma assinatura de um middleware do Express.
  return function wrappedHandler(req, res, next) {
    // Promise.resolve(...) garante uma Promise mesmo que o handler não seja async.
    // .catch(next): se der erro, chama next(erro) → o Express pula para o error-handler.
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Exporta a função.
module.exports = asyncHandler;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   A rota chama wrappedHandler → que chama o controller → se a Promise falhar,
 *   o .catch(next) entrega o erro ao Express, que o leva ao error-handler.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Promises, async/await e rejeição de Promises.
 *   - Funções que recebem e devolvem funções (funções de ordem superior / "wrappers").
 *   - Fluxo de erros no Express com next(erro).
 * ============================================================================
 */
