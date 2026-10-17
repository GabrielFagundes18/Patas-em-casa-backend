/*
 * ============================================================================
 * ARQUIVO: upload.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Recebe o ENVIO DE FOTOS (upload) dos animais. Requisições com arquivos usam
 *   o formato "multipart/form-data", que o express.json() não entende; quem lê
 *   esse formato é a biblioteca "multer". Aqui ela é configurada com limites
 *   (até 10 fotos de 5 MB) e as mensagens de erro são traduzidas.
 *
 * PRINCIPAIS ITENS:
 *   - MAX_FILE_BYTES, MAX_FILES, MULTER_MESSAGES.
 *   - receive: o middleware do multer já configurado (interno).
 *   - receivePhotos(req, res, next): middleware exportado (com tradução dos erros).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - multer e ../utils/app-error.
 *   - Usado por: modules/animals/animal-routes.js (rota de envio de fotos).
 *   - O conteúdo dos arquivos é conferido depois em integrations/storage/photo-storage.js / animal-service.
 * ============================================================================
 */

// multer: lê requisições multipart/form-data (envio de arquivos).
const multer = require('multer');
// Erro da aplicação.
const AppError = require('../utils/app-error');

// Tamanho máximo de cada arquivo: 5 MB (5 × 1024 × 1024 bytes).
const MAX_FILE_BYTES = 5 * 1024 * 1024;
// Máximo de arquivos por envio.
const MAX_FILES = 10;

// Mensagens em português para os códigos de erro do multer.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Cada foto pode ter até 5 MB.',
  LIMIT_FILE_COUNT: `Envie até ${MAX_FILES} fotos por vez.`,
  LIMIT_UNEXPECTED_FILE: 'Envie as fotos no campo "fotos".',
};

// Recebe as fotos em memória (até 10 de 5 MB); o conteúdo é conferido no serviço antes de ir para o disco.
// memoryStorage: os arquivos ficam em req.files[i].buffer (não são gravados em disco ainda).
// .array('fotos', MAX_FILES): aceita vários arquivos no campo de nome "fotos".
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } })
  .array('fotos', MAX_FILES);

/*
 * FUNÇÃO: receivePhotos (middleware)
 * O que faz: executa o multer e converte os erros dele em AppError 422 com mensagem amigável.
 * Parâmetros: req, res, next.
 * Retorno: nada diretamente; chama next() ou next(erro) quando o multer termina.
 */
function receivePhotos(req, res, next) {
  // Chamamos o middleware do multer "à mão", passando nossa própria função no lugar do next,
  // para poder tratar o erro antes de seguir.
  receive(req, res, (error) => {
    // Sem erro: segue (req.files já está preenchido).
    if (!error) return next();
    // Erro conhecido do multer (limite de tamanho, quantidade, campo errado): 422 com mensagem traduzida.
    if (error instanceof multer.MulterError) {
      const message = MULTER_MESSAGES[error.code] || 'Não foi possível receber as fotos.';
      return next(new AppError(422, 'ARQUIVO_INVALIDO', message, [{ field: 'fotos', message }]));
    }
    // Outro erro qualquer: repassa (vai virar 500 no error-handler).
    return next(error);
  });
}

// Exporta o middleware.
module.exports = { receivePhotos };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   A rota de fotos usa receivePhotos → o multer lê os arquivos do campo "fotos"
 *   para a memória, respeitando os limites → em erro, responde 422 com mensagem
 *   clara → sem erro, o controller recebe req.files e o service valida o
 *   conteúdo (tipo real da imagem) antes de gravar.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - multipart/form-data e upload de arquivos.
 *   - Biblioteca multer: storage, limits, array().
 *   - Limitar tamanho e quantidade de arquivos (proteção contra abuso).
 *   - Envolver um middleware para personalizar o tratamento de erros.
 * ============================================================================
 */
