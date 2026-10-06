const multer = require('multer');
const AppError = require('../utils/app-error');

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Cada foto pode ter até 5 MB.',
  LIMIT_FILE_COUNT: `Envie até ${MAX_FILES} fotos por vez.`,
  LIMIT_UNEXPECTED_FILE: 'Envie as fotos no campo "fotos".',
};

// Recebe as fotos em memória (até 10 de 5 MB); o conteúdo é conferido no serviço antes de ir para o disco.
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } })
  .array('fotos', MAX_FILES);

function receivePhotos(req, res, next) {
  receive(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = MULTER_MESSAGES[error.code] || 'Não foi possível receber as fotos.';
      return next(new AppError(422, 'ARQUIVO_INVALIDO', message, [{ field: 'fotos', message }]));
    }
    return next(error);
  });
}

module.exports = { receivePhotos };
