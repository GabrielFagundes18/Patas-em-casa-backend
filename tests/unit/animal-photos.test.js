/*
 * ============================================================================
 * ARQUIVO: animal-photos.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES da GALERIA DE FOTOS dos animais (animal-service + photo-storage),
 *   gravando arquivos de verdade numa pasta temporária: detecção do tipo pelo
 *   conteúdo, primeira foto vira principal, arquivos inválidos são recusados
 *   antes de gravar qualquer um, foto principal sincronizada com foto_url e
 *   perfil público (410 para adotado, temperamento normalizado).
 *
 * PRINCIPAIS ITENS:
 *   - PNG, JPG, WEBP: arquivos mínimos de exemplo (bytes).
 *   - setup(): pasta temporária, storage real, repository e galeria em memória.
 *   - 5 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/animals/animal-service.js e src/integrations/storage/photo-storage.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Arquivos.
const fs = require('node:fs');
// Sistema operacional (pasta temporária).
const os = require('node:os');
// Caminhos.
const path = require('node:path');
// Executor de testes.
const test = require('node:test');
// Itens testados.
const { createAnimalService } = require('../../src/modules/animals/animal-service');
const { createPhotoStorage, detectImage } = require('../../src/integrations/storage/photo-storage');

// Um PNG válido de 1×1 pixel, escrito em hexadecimal.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005f4f8d3f0000000049454e44ae426082', 'hex');
// "JPG": só os bytes iniciais (FF D8 FF E0) + zeros — basta para a detecção.
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
// "WEBP": "RIFF" + 4 bytes + "WEBPVP8 " + zeros.
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);

/*
 * FUNÇÃO: setup
 * O que faz: cria uma pasta temporária única (mkdtempSync), um storage real nela, um animal de
 *   exemplo e uma galeria falsa em memória ("rows"), e monta o service com tudo isso.
 * Retorno: { service, storage, animal, rows, dir, audits }.
 */
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patas-fotos-'));
  const storage = createPhotoStorage({ config: { uploadDir: dir, apiPublicUrl: 'https://api.patas.example' } });
  const animal = { id: 'a1', nome: 'Nino', status: 'disponivel', foto_url: 'https://externo.example/nino.jpg', temperamento: [] };
  const rows = [];
  let seq = 0;
  // Galeria em memória com a mesma interface do animal-media-repository.
  const media = {
    // Principal primeiro, depois pela ordem ("||" desempata quando a 1ª comparação dá 0).
    listForAnimal: async (animalId) => rows.filter((row) => row.animal_id === animalId)
      .sort((a, b) => Number(b.principal) - Number(a.principal) || a.ordem - b.ordem),
    create: async (data) => {
      const row = { id: `f${++seq}`, animal_id: data.animalId, objeto_chave: data.objetoChave, principal: data.principal, ordem: seq };
      rows.push(row);
      return row;
    },
    findById: async (id) => rows.find((row) => row.id === id) || null,
    // splice remove o item na posição encontrada.
    remove: async (id) => rows.splice(rows.findIndex((row) => row.id === id), 1),
    setPrincipal: async (animalId, id) => rows.forEach((row) => { row.principal = row.id === id; }),
  };
  const audits = [];
  // Repository de animais falso: update altera o próprio objeto "animal" (Object.assign).
  const service = createAnimalService({
    findById: async (id) => (id === animal.id ? { ...animal } : null),
    update: async (id, changes) => Object.assign(animal, changes),
    remove: async () => ({ id: animal.id }),
  }, { audit: { record: async (event) => audits.push(event) }, media, storage });
  return { service, storage, animal, rows, dir, audits };
}

// Teste 1: o tipo vem dos bytes; um SVG (que poderia ter script) é recusado.
test('image types are detected by content, not by name', () => {
  assert.equal(detectImage(PNG).mime, 'image/png');
  assert.equal(detectImage(JPG).mime, 'image/jpeg');
  assert.equal(detectImage(WEBP).mime, 'image/webp');
  assert.equal(detectImage(Buffer.from('<svg onload="alert(1)"></svg>')), null);
});

// Teste 2: duas fotos enviadas → a 1ª é a principal, vira o foto_url e os 2 arquivos existem no disco.
test('the first uploaded photo becomes the main photo and the site URL', async () => {
  const { service, animal, dir } = setup();

  const detail = await service.addPhotos('a1', [{ originalname: 'a.png', buffer: PNG }, { originalname: 'b.jpg', buffer: JPG }]);

  assert.equal(detail.fotos.length, 2);
  assert.equal(detail.fotos[0].principal, true);
  // URL pública: endereço da API + /uploads/animais/<uuid>.png.
  assert.match(detail.fotos[0].url, /^https:\/\/api\.patas\.example\/uploads\/animais\/[0-9a-f-]{36}\.png$/);
  assert.equal(animal.foto_url, detail.fotos[0].url);
  assert.equal(fs.readdirSync(path.join(dir, 'animais')).length, 2);
});

// Teste 3: um arquivo inválido no lote → nada é gravado; lista vazia e mais de 12 fotos também são recusadas.
test('invalid files are rejected before anything is written', async () => {
  const { service, dir } = setup();

  await assert.rejects(
    service.addPhotos('a1', [{ originalname: 'ok.png', buffer: PNG }, { originalname: 'virus.exe', buffer: Buffer.from('MZ....') }]),
    (error) => error.code === 'ARQUIVO_INVALIDO' && /virus\.exe/.test(error.details[0].message)
  );
  // A pasta nem chegou a ser criada.
  assert.equal(fs.existsSync(path.join(dir, 'animais')), false);
  await assert.rejects(service.addPhotos('a1', []), { code: 'ARQUIVO_INVALIDO' });
  // Array.from({ length: 13 }, fn) cria 13 itens.
  await assert.rejects(service.addPhotos('a1', Array.from({ length: 13 }, () => ({ buffer: PNG }))), { code: 'LIMITE_DE_FOTOS' });
});

// Teste 4: trocar e remover a principal mantém o foto_url certo; sem fotos, foto_url = null e a pasta fica vazia.
test('changing and removing the main photo keeps foto_url in sync and deletes the file', async () => {
  const { service, animal, dir } = setup();
  const { fotos } = await service.addPhotos('a1', [{ buffer: PNG }, { buffer: JPG }]);
  const [first, second] = fotos;

  const changed = await service.setPrincipalPhoto('a1', second.id);
  assert.equal(changed.fotos[0].id, second.id);
  assert.equal(animal.foto_url, second.url);

  await service.removePhoto('a1', second.id);
  assert.equal(animal.foto_url, first.url);
  await service.removePhoto('a1', first.id);
  assert.equal(animal.foto_url, null);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'animais')), []);
  // Remover de novo → 404.
  await assert.rejects(service.removePhoto('a1', first.id), { status: 404, code: 'FOTO_NAO_ENCONTRADA' });
});

// Teste 5: perfil público — adotado 410 com o nome, inativo 404; temperamento sem espaços, vazios e repetidos.
test('adopted animals answer 410 with their name; temperament is normalized', async () => {
  const { service, animal } = setup();
  animal.status = 'adotado';
  await assert.rejects(service.getPublicById('a1'), (error) => error.status === 410 && error.message === 'Nino já encontrou um lar.');
  animal.status = 'inativo';
  await assert.rejects(service.getPublicById('a1'), { status: 404 });

  animal.status = 'disponivel';
  await service.update('a1', { temperamento: [' brincalhão ', 'calmo', 'brincalhão', ''] });
  const publicAnimal = await service.getPublicById('a1');
  assert.deepEqual(publicAnimal.temperamento, ['brincalhão', 'calmo']);
  assert.deepEqual(publicAnimal.fotos, []);
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste chama setup() (pasta temporária nova + galeria vazia), executa
 *   operações de fotos e confere o resultado na resposta, no objeto do animal e
 *   nos arquivos do disco.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testes com arquivos reais em pasta temporária (os.tmpdir, mkdtempSync).
 *   - Buffers e "magic bytes".
 *   - Ordenação com comparadores e desempate com "||".
 * ============================================================================
 */
