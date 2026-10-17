/*
 * ============================================================================
 * ARQUIVO: photo-storage.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   GUARDA AS FOTOS dos animais no disco do servidor (pasta UPLOAD_DIR/animais)
 *   e monta a URL pública de cada uma. Antes de gravar, confere o TIPO REAL do
 *   arquivo pelos primeiros bytes ("magic bytes"): só aceita JPG, PNG e WebP.
 *   Cada foto ganha um nome aleatório (UUID), o que evita conflitos e impede
 *   que alguém escolha o nome do arquivo no servidor.
 *
 * PRINCIPAIS ITENS:
 *   - SIGNATURES: assinaturas de bytes dos formatos aceitos.
 *   - detectImage(buffer): identifica o formato (exportada).
 *   - createPhotoStorage({ config, folder }): cria o armazenamento com save, remove e urlFor (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto, node:fs/promises, node:path, ../../utils/app-error, ../../config/env.
 *   - Usado por: modules/animals/animal-service.js (fotos dos animais).
 *   - As fotos são servidas por src/app.js em /uploads.
 * ============================================================================
 */

// Nomes aleatórios.
const { randomUUID } = require('node:crypto');
// Funções de arquivo em versão "Promise" (podem ser usadas com await).
const fs = require('node:fs/promises');
// Montagem de caminhos.
const path = require('node:path');
// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Configuração (pasta de uploads e URL pública da API).
const { readConfig } = require('../../config/env');

// Assinaturas (magic bytes) dos formatos aceitos: o tipo vem do conteúdo, não do nome nem do cabeçalho
// enviado pelo navegador, que podem ser forjados.
// "b" é o Buffer (bytes) do arquivo. 0xff, 0xd8... são bytes escritos em hexadecimal.
const SIGNATURES = [
  // JPEG começa com FF D8 FF.
  { mime: 'image/jpeg', ext: 'jpg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // PNG começa com 8 bytes fixos (89 50 4E 47 0D 0A 1A 0A — "\x89PNG\r\n\x1a\n").
  { mime: 'image/png', ext: 'png', matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  // WebP: "RIFF" nos bytes 0–3 e "WEBP" nos bytes 8–11.
  { mime: 'image/webp', ext: 'webp', matches: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

/*
 * FUNÇÃO: detectImage
 * O que faz: descobre o formato da imagem pelos bytes.
 * Parâmetros: buffer (Buffer) — conteúdo do arquivo.
 * Retorno: o item de SIGNATURES que combinou ({ mime, ext, matches }) ou null.
 */
function detectImage(buffer) {
  // find devolve o primeiro item que satisfaz a condição.
  return SIGNATURES.find((signature) => signature.matches(buffer)) || null;
}

/*
 * FUNÇÃO: createPhotoStorage (fábrica)
 * Parâmetros (objeto, opcional): config (padrão readConfig()) e folder (subpasta, padrão 'animais').
 * Retorno: { save, remove, urlFor, directory }.
 */
// Fotos no disco do servidor (UPLOAD_DIR/<pasta>), com nome aleatório; servidas pela API em /uploads.
function createPhotoStorage({ config = readConfig(), folder = 'animais' } = {}) {
  // Caminho absoluto da pasta (ex.: /app/uploads/animais).
  const directory = path.resolve(config.uploadDir, folder);

  /*
   * FUNÇÃO INTERNA: save (async)
   * O que faz: valida o formato e grava a foto com nome aleatório.
   * Parâmetros: buffer (Buffer).
   * Retorno: { key (nome do arquivo), mime, size (bytes) }. Lança 422 se o formato não for aceito.
   */
  async function save(buffer) {
    const image = detectImage(buffer);
    if (!image) {
      throw new AppError(422, 'ARQUIVO_INVALIDO', 'Envie fotos em JPG, PNG ou WebP.', [
        { field: 'fotos', message: 'Formato não aceito. Use JPG, PNG ou WebP.' },
      ]);
    }
    // Cria a pasta (e as pastas acima dela) se ainda não existir.
    await fs.mkdir(directory, { recursive: true });
    // Nome: UUID + extensão do formato detectado.
    const key = `${randomUUID()}.${image.ext}`;
    // flag 'wx' = escrever só se o arquivo NÃO existir (nunca sobrescreve outro arquivo).
    await fs.writeFile(path.join(directory, key), buffer, { flag: 'wx' });
    return { key, mime: image.mime, size: buffer.length };
  }

  /*
   * FUNÇÃO INTERNA: remove (async)
   * O que faz: apaga a foto do disco. "force: true" não dá erro se o arquivo já não existir.
   */
  async function remove(key) {
    // A chave vem do banco, mas basename() garante que nada fora da pasta seja apagado.
    // (basename('../../etc/x') = 'x': impede "path traversal", sair da pasta com "../".)
    await fs.rm(path.join(directory, path.basename(key)), { force: true });
  }

  /*
   * FUNÇÃO INTERNA: urlFor
   * O que faz: monta a URL pública da foto. Ex.: https://api.site.org/uploads/animais/<uuid>.jpg
   */
  function urlFor(key) {
    return `${config.apiPublicUrl}/uploads/${folder}/${encodeURIComponent(key)}`;
  }

  return { save, remove, urlFor, directory };
}

// Exporta a fábrica e o detector.
module.exports = { createPhotoStorage, detectImage };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O multer recebe as fotos na memória → o animal-service chama save(buffer) →
 *   detectImage confere os bytes → grava com nome UUID → o banco guarda a "key" →
 *   urlFor gera o endereço servido por /uploads. Ao excluir, remove(key).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - "Magic bytes": identificar arquivos pelo conteúdo, não pela extensão.
 *   - Buffer, bytes e números hexadecimais.
 *   - fs/promises (mkdir, writeFile, rm) e flags de escrita.
 *   - Segurança com arquivos: nomes aleatórios e proteção contra path traversal.
 * ============================================================================
 */
