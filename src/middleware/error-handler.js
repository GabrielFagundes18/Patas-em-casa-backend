/*
 * ============================================================================
 * ARQUIVO: error-handler.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   É o TRATADOR CENTRAL DE ERROS da API. Todo erro (lançado num controller,
 *   service, validador ou middleware) termina aqui. Ele:
 *     - converte o erro num AppError (status + código + mensagem);
 *     - esconde detalhes técnicos de erros inesperados (responde só "erro interno");
 *     - registra o erro no log (sem dados pessoais);
 *     - responde no formato padrão { error: { code, message, details } }.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - errorHandler(error, req, res, next): middleware de erro (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../utils/app-error, ../utils/http-response (errorResponse), ../utils/logger.
 *   - Registrado por último em src/app.js.
 * ============================================================================
 */

// Classe de erro da aplicação.
const AppError = require('../utils/app-error');
// Formato padrão das respostas de erro.
const { errorResponse } = require('../utils/http-response');
// Logs.
const logger = require('../utils/logger');

/*
 * FUNÇÃO: errorHandler (middleware de erro)
 * O que faz: transforma qualquer erro numa resposta JSON padronizada.
 * Parâmetros (o Express reconhece um middleware de ERRO por ter 4 parâmetros):
 *   - error: o erro recebido.
 *   - req, res, next: padrão do Express.
 * Retorno: a resposta enviada (res.status(...).json(...)).
 */
function errorHandler(error, req, res, next) {
  // Se a resposta já começou a ser enviada, não dá para mudar o status:
  // repassa ao tratador padrão do Express, que encerra a conexão.
  if (res.headersSent) return next(error);

  // O erro "normalizado" que será respondido.
  let applicationError;

  if (error instanceof AppError) {
    // Erro esperado da aplicação: usa como está.
    applicationError = error;
  } else if (error.type === 'entity.parse.failed') {
    // express.json() não conseguiu ler o JSON do corpo.
    applicationError = new AppError(400, 'JSON_INVALIDO', 'O corpo da requisição contém JSON inválido.');
  } else if (error.type === 'entity.too.large') {
    // Corpo maior que o limite (1 MB, definido em app.js).
    applicationError = new AppError(400, 'CORPO_MUITO_GRANDE', 'O corpo da requisição excede o limite permitido.');
  } else {
    // Qualquer outro erro é inesperado (bug, banco fora do ar...): resposta genérica 500,
    // sem revelar detalhes internos a quem fez a requisição.
    applicationError = new AppError(500, 'ERRO_INTERNO', 'Ocorreu um erro interno do servidor.');
  }

  // Log técnico: id da requisição, método, status e código (nada de dados pessoais).
  logger.error('request_failed', {
    requestId: req.requestId,
    method: req.method,
    statusCode: applicationError.status,
    code: applicationError.code,
  });

  // Responde com o status e o corpo padronizado.
  return res
    .status(applicationError.status)
    .json(errorResponse(
      applicationError.code,
      applicationError.message,
      applicationError.details
    ));
}

// Exporta o middleware.
module.exports = errorHandler;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   next(erro) ou um "throw" dentro do asyncHandler → Express chama errorHandler →
 *   o erro vira AppError (conhecido, JSON inválido, corpo grande ou 500 genérico) →
 *   log → resposta { error: { code, message, details } }.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Middleware de erro do Express (assinatura com 4 parâmetros).
 *   - instanceof e normalização de erros.
 *   - Não vazar detalhes internos em erros 500 (segurança).
 *   - res.headersSent e o encadeamento res.status().json().
 * ============================================================================
 */
