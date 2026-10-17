/*
 * ============================================================================
 * ARQUIVO: validate-request.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Executa um VALIDADOR antes do controller. O validador recebe o corpo
 *   (body), os parâmetros da URL (params) e a query string (query) e devolve uma
 *   lista de problemas. Se a lista não estiver vazia, a requisição é recusada
 *   com 422 e os detalhes de cada campo; senão, segue para o controller.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - validateRequest(validator): fábrica de middleware (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../utils/app-error.
 *   - Usado nos arquivos de rotas com os validadores de cada módulo
 *     (modules/*\/...-validators.js e utils/validators.js).
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../utils/app-error');

/*
 * FUNÇÃO: validateRequest
 * O que faz: cria um middleware que roda o validador informado.
 * Parâmetros:
 *   - validator (função): recebe { body, params, query } e devolve um array de detalhes
 *     ({ field, message }); array vazio = tudo válido.
 * Retorno (função middleware).
 * Uso: router.post('/', validateRequest(validateCreateAnimal), controller.create).
 */
function validateRequest(validator) {
  return (req, res, next) => {
    // try/catch: se o próprio validador lançar erro, ele é repassado ao error-handler.
    try {
      const details = validator({
        // Sem corpo (ex.: GET), usa objeto vazio para o validador não quebrar.
        body: req.body || {},
        params: req.params,
        query: req.query,
      });

      // Há problemas: responde 422 (dados recebidos, mas inválidos) com a lista de detalhes.
      if (details.length > 0) {
        return next(new AppError(
          422,
          'VALIDACAO_INVALIDA',
          'Verifique os campos informados.',
          details
        ));
      }

      // Tudo válido: segue para o controller.
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// Exporta a fábrica.
module.exports = validateRequest;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Rota → validateRequest(validador) → validador devolve detalhes →
 *   se houver: 422 VALIDACAO_INVALIDA com os detalhes; se não: next() → controller.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validação como etapa separada (antes da regra de negócio).
 *   - Status 422 (Unprocessable Entity) x 400 (Bad Request).
 *   - Middlewares "fábrica" e arrow functions.
 * ============================================================================
 */
