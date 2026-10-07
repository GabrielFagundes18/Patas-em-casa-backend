const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const AppError = require('../../utils/app-error');
const { readConfig } = require('../../config/env');

// Assinaturas (magic bytes) dos formatos aceitos: o tipo vem do conteúdo, não do nome nem do cabeçalho
// enviado pelo navegador, que podem ser forjados.
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', matches: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

function detectImage(buffer) {
  return SIGNATURES.find((signature) => signature.matches(buffer)) || null;
}

// Fotos no disco do servidor (UPLOAD_DIR/<pasta>), com nome aleatório; servidas pela API em /uploads.
function createPhotoStorage({ config = readConfig(), folder = 'animais' } = {}) {
  const directory = path.resolve(config.uploadDir, folder);

  async function save(buffer) {
    const image = detectImage(buffer);
    if (!image) {
      throw new AppError(422, 'ARQUIVO_INVALIDO', 'Envie fotos em JPG, PNG ou WebP.', [
        { field: 'fotos', message: 'Formato não aceito. Use JPG, PNG ou WebP.' },
      ]);
    }
    await fs.mkdir(directory, { recursive: true });
    const key = `${randomUUID()}.${image.ext}`;
    await fs.writeFile(path.join(directory, key), buffer, { flag: 'wx' });
    return { key, mime: image.mime, size: buffer.length };
  }

  async function remove(key) {
    // A chave vem do banco, mas basename() garante que nada fora da pasta seja apagado.
    await fs.rm(path.join(directory, path.basename(key)), { force: true });
  }

  function urlFor(key) {
    return `${config.apiPublicUrl}/uploads/${folder}/${encodeURIComponent(key)}`;
  }

  return { save, remove, urlFor, directory };
}

module.exports = { createPhotoStorage, detectImage };
