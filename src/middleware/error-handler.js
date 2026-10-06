const AppError = require('../utils/app-error');
const { errorResponse } = require('../utils/http-response');
const logger = require('../utils/logger');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let applicationError;

  if (error instanceof AppError) {
    applicationError = error;
  } else if (error.type === 'entity.parse.failed') {
    applicationError = new AppError(400, 'JSON_INVALIDO', 'O corpo da requisição contém JSON inválido.');
  } else if (error.type === 'entity.too.large') {
    applicationError = new AppError(400, 'CORPO_MUITO_GRANDE', 'O corpo da requisição excede o limite permitido.');
  } else {
    applicationError = new AppError(500, 'ERRO_INTERNO', 'Ocorreu um erro interno do servidor.');
  }

  logger.error('request_failed', {
    requestId: req.requestId,
    method: req.method,
    statusCode: applicationError.status,
    code: applicationError.code,
  });

  return res
    .status(applicationError.status)
    .json(errorResponse(
      applicationError.code,
      applicationError.message,
      applicationError.details
    ));
}

module.exports = errorHandler;