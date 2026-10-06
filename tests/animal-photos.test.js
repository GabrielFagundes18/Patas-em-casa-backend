const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createAnimalService } = require('../src/services/animals/animal-service');
const { createPhotoStorage, detectImage } = require('../src/services/storage/photo-storage');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005f4f8d3f0000000049454e44ae426082', 'hex');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patas-fotos-'));
  const storage = createPhotoStorage({ config: { uploadDir: dir, apiPublicUrl: 'https://api.patas.example' } });
  const animal = { id: 'a1', nome: 'Nino', status: 'disponivel', foto_url: 'https://externo.example/nino.jpg', temperamento: [] };
  const rows = [];
  let seq = 0;
  const media = {
    listForAnimal: async (animalId) => rows.filter((row) => row.animal_id === animalId)
      .sort((a, b) => Number(b.principal) - Number(a.principal) || a.ordem - b.ordem),
    create: async (data) => {
      const row = { id: `f${++seq}`, animal_id: data.animalId, objeto_chave: data.objetoChave, principal: data.principal, ordem: seq };
      rows.push(row);
      return row;
    },
    findById: async (id) => rows.find((row) => row.id === id) || null,
    remove: async (id) => rows.splice(rows.findIndex((row) => row.id === id), 1),
    setPrincipal: async (animalId, id) => rows.forEach((row) => { row.principal = row.id === id; }),
  };
  const audits = [];
  const service = createAnimalService({
    findById: async (id) => (id === animal.id ? { ...animal } : null),
    update: async (id, changes) => Object.assign(animal, changes),
    remove: async () => ({ id: animal.id }),
  }, { audit: { record: async (event) => audits.push(event) }, media, storage });
  return { service, storage, animal, rows, dir, audits };
}

test('image types are detected by content, not by name', () => {
  assert.equal(detectImage(PNG).mime, 'image/png');
  assert.equal(detectImage(JPG).mime, 'image/jpeg');
  assert.equal(detectImage(WEBP).mime, 'image/webp');
  assert.equal(detectImage(Buffer.from('<svg onload="alert(1)"></svg>')), null);
});

test('the first uploaded photo becomes the main photo and the site URL', async () => {
  const { service, animal, dir } = setup();

  const detail = await service.addPhotos('a1', [{ originalname: 'a.png', buffer: PNG }, { originalname: 'b.jpg', buffer: JPG }]);

  assert.equal(detail.fotos.length, 2);
  assert.equal(detail.fotos[0].principal, true);
  assert.match(detail.fotos[0].url, /^https:\/\/api\.patas\.example\/uploads\/animais\/[0-9a-f-]{36}\.png$/);
  assert.equal(animal.foto_url, detail.fotos[0].url);
  assert.equal(fs.readdirSync(path.join(dir, 'animais')).length, 2);
});

test('invalid files are rejected before anything is written', async () => {
  const { service, dir } = setup();

  await assert.rejects(
    service.addPhotos('a1', [{ originalname: 'ok.png', buffer: PNG }, { originalname: 'virus.exe', buffer: Buffer.from('MZ....') }]),
    (error) => error.code === 'ARQUIVO_INVALIDO' && /virus\.exe/.test(error.details[0].message)
  );
  assert.equal(fs.existsSync(path.join(dir, 'animais')), false);
  await assert.rejects(service.addPhotos('a1', []), { code: 'ARQUIVO_INVALIDO' });
  await assert.rejects(service.addPhotos('a1', Array.from({ length: 13 }, () => ({ buffer: PNG }))), { code: 'LIMITE_DE_FOTOS' });
});

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
  await assert.rejects(service.removePhoto('a1', first.id), { status: 404, code: 'FOTO_NAO_ENCONTRADA' });
});

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
