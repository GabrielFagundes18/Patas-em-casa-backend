/*
 * ============================================================================
 * ARQUIVO: app-error.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define a classe AppError: um ERRO "ESPERADO" da aplicação, que já sabe qual
 *   status HTTP responder (400, 404, 409...), qual código técnico usar
 *   (ex.: 'ANIMAL_NAO_ENCONTRADO') e quais detalhes mostrar. Assim, qualquer parte
 *   do código pode fazer "throw new AppError(...)" e o tratador de erros
 *   (middleware/error-handler.js) monta a resposta certa.
 *
 * PRINCIPAIS ITENS:
 *   - class AppError extends Error (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usada por praticamente todo o backend (services, validadores, middlewares, utils).
 *   - Lida por: src/middleware/error-handler.js.
 * ============================================================================
 */

/*
 * CLASSE: AppError
 * O que é: um tipo de erro com informações extras para a resposta HTTP.
 * "extends Error" → herda tudo da classe Error do JavaScript (mensagem, pilha de chamadas...).
 * Construtor (parâmetros):
 *   - status (number): código HTTP (ex.: 404 = não encontrado, 422 = regra de negócio violada).
 *   - code (string): código técnico do erro, estável para o frontend/testes (ex.: 'CSRF_INVALIDO').
 *   - message (string): mensagem em português para a pessoa usuária.
 *   - details (array, opcional): detalhes, ex.: [{ field: 'email', message: 'Informe um e-mail válido.' }].
 */
class AppError extends Error {
  // constructor: roda quando fazemos "new AppError(...)".
  constructor(status, code, message, details = []) {
    // super(message): chama o construtor da classe-mãe (Error), que guarda a mensagem.
    super(message);
    // Nome do tipo de erro (aparece em logs e na pilha de chamadas).
    this.name = 'AppError';
    // "this" é o objeto que está sendo criado; guardamos nele as informações extras.
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Exporta a própria classe.
module.exports = AppError;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Quem detecta um problema faz: throw new AppError(404, 'X_NAO_ENCONTRADO', 'Mensagem').
 *   O erro sobe até o Express, que o entrega ao error-handler; este usa status,
 *   code, message e details para responder em JSON.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Classes em JavaScript: class, constructor, extends, super e this.
 *   - Erros personalizados e "throw".
 *   - Códigos de status HTTP (4xx = erro de quem pediu; 5xx = erro do servidor).
 *   - Separar erros esperados (AppError) de erros inesperados (bugs).
 * ============================================================================
 */
