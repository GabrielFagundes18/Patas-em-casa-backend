const AppError = require('../../utils/app-error');
const { parsePagination } = require('../../utils/pagination');
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
const animalRepository = require('../../repositories/animals/animal-repository');
const animalMediaRepository = require('../../repositories/animals/animal-media-repository');
const auditService = require('../audit/audit-service');
const { createPhotoStorage, detectImage } = require('../storage/photo-storage');
const { assertStatusTransition } = require('./animal-status-rules');

const { animal: animalValues } = require('../../config/domain-values');

// Campos que o site público pode ver (sem datas internas de controle).
const PUBLIC_FIELDS = [
  'id', 'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado', 'temperamento',
];

const EDITABLE_FIELDS = [
  'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado', 'temperamento',
];

const MAX_PHOTOS_PER_ANIMAL = 12;

// Traços de temperamento: sem repetidos nem vazios, na ordem informada.
function normalizeTemperament(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function photoNotFound() {
  return new AppError(404, 'FOTO_NAO_ENCONTRADA', 'Foto não encontrada para este animal.');
}

function parseOptionalBoolean(value) {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

function buildFilters(query = {}) {
  return {
    q: query.q ? String(query.q).trim() : '',
    especie: query.especie,
    sexo: query.sexo,
    porte: query.porte,
    status: query.status,
    castrado: parseOptionalBoolean(query.castrado),
    vacinado: parseOptionalBoolean(query.vacinado),
    idadeMin: query.idadeMin === undefined ? undefined : Number(query.idadeMin),
    idadeMax: query.idadeMax === undefined ? undefined : Number(query.idadeMax),
    sort: query.sort || 'data_entrada',
    order: query.order?.toLowerCase() === 'asc' ? 'asc' : 'desc',
  };
}

// Só os campos alterados entram na auditoria (antes e depois).
function diff(before, after) {
  const changed = EDITABLE_FIELDS.filter((field) => String(before[field]) !== String(after[field]));
  return {
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, after[field]])),
  };
}

function createAnimalService(repository = animalRepository, {
  audit = auditService,
  media = animalMediaRepository,
  storage = createPhotoStorage(),
} = {}) {
  function toPhoto(row) {
    return { id: row.id, url: storage.urlFor(row.objeto_chave), principal: row.principal, ordem: row.ordem };
  }

  async function withPhotos(animal) {
    return { ...animal, fotos: (await media.listForAnimal(animal.id)).map(toPhoto) };
  }

  async function list(query = {}) {
    return repository.list({ ...parsePagination(query), ...buildFilters(query) });
  }

  async function listAll(filters = {}) {
    const pageSize = 100;
    const items = [];
    let page = 1;
    let total = 0;

    do {
      const result = await repository.list({
        ...filters,
        page,
        pageSize,
        offset: (page - 1) * pageSize,
        sort: filters.sort || 'data_entrada',
        order: filters.order || 'desc',
      });
      items.push(...result.items);
      total = result.total;
      page += 1;
    } while (items.length < total);

    return items;
  }

  async function listPublic() {
    return listAll({ statusIn: animalValues.publicStatus });
  }

  function toPublicAnimal(animal) {
    return Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, animal[field]]));
  }

  async function listPublicPage(query = {}) {
    const { items, total } = await repository.list({
      ...parsePagination(query),
      ...buildFilters({ ...query, status: undefined }),
      statusIn: animalValues.publicStatus,
    });
    return { items: items.map(toPublicAnimal), total };
  }

  // Perfil público: adotado ou em processo responde 410 com o nome (o site mostra o aviso certo);
  // inativo ou inexistente, 404.
  async function getPublicById(id) {
    const animal = await repository.findById(id);
    if (animal && ['adotado', 'em_processo'].includes(animal.status)) {
      const message = animal.status === 'adotado'
        ? `${animal.nome} já encontrou um lar.`
        : `${animal.nome} está em processo de adoção.`;
      throw new AppError(410, 'ANIMAL_INDISPONIVEL', message, [{ field: 'status', message: animal.status }]);
    }
    if (!animal || !animalValues.publicStatus.includes(animal.status)) {
      throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado ou indisponível para adoção.');
    }
    const { fotos, ...publicAnimal } = await withPhotos(toPublicAnimal(animal));
    return { ...publicAnimal, fotos: fotos.map(({ id: photoId, url, principal }) => ({ id: photoId, url, principal })) };
  }

  async function listForExport(query = {}) {
    const rows = await repository.listForExport(buildFilters(query), MAX_EXPORT_ROWS);
    ensureExportLimit(rows.length);
    return rows;
  }

  async function getById(id) {
    const animal = await repository.findById(id);
    if (!animal) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
    return animal;
  }

  async function getDetail(id) {
    return withPhotos(await getById(id));
  }

  async function create(payload, actor = {}) {
    const status = payload.status || 'disponivel';
    assertStatusTransition({ from: null, to: status, role: actor.role });

    const animal = await repository.create({
      nome: payload.nome.trim(),
      especie: payload.especie,
      raca: payload.raca?.trim() || null,
      sexo: payload.sexo || null,
      idade_anos: payload.idade_anos === undefined || payload.idade_anos === null || payload.idade_anos === ''
        ? null
        : Number(payload.idade_anos),
      porte: payload.porte || null,
      status,
      descricao: payload.descricao || null,
      foto_url: payload.foto_url || null,
      data_entrada: payload.data_entrada || new Date().toISOString().slice(0, 10),
      castrado: payload.castrado ?? false,
      vacinado: payload.vacinado ?? false,
      temperamento: normalizeTemperament(payload.temperamento),
    });

    await audit.record({ actor, action: 'criar', module: 'animals', entity: 'animal', entityId: animal.id, after: animal });
    return animal;
  }

  async function update(id, payload, actor = {}) {
    const current = await getById(id);
    const changes = Object.fromEntries(Object.entries(payload).filter(([field]) => EDITABLE_FIELDS.includes(field)));

    if (typeof changes.nome === 'string') changes.nome = changes.nome.trim();
    if (changes.idade_anos !== undefined && changes.idade_anos !== null && changes.idade_anos !== '') {
      changes.idade_anos = Number(changes.idade_anos);
    } else if (changes.idade_anos === '') {
      changes.idade_anos = null;
    }
    if (Object.hasOwn(changes, 'raca') && !changes.raca) changes.raca = null;
    if (Object.hasOwn(changes, 'temperamento')) changes.temperamento = normalizeTemperament(changes.temperamento);

    if (changes.status && changes.status !== current.status) {
      assertStatusTransition({ from: current.status, to: changes.status, role: actor.role, motivo: payload.motivo });
    }

    const animal = await repository.update(id, changes);
    if (!animal) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');

    const { before, after } = diff(current, animal);
    if (Object.keys(after).length > 0) {
      await audit.record({
        actor,
        action: before.status !== undefined ? 'alterar_status' : 'editar',
        module: 'animals',
        entity: 'animal',
        entityId: id,
        before,
        after: payload.motivo ? { ...after, motivo: payload.motivo } : after,
      });
    }

    return animal;
  }

  async function changeStatus(id, { status, motivo }, actor = {}) {
    return update(id, { status, motivo }, actor);
  }

  async function remove(id, actor = {}) {
    const current = await getById(id);
    const photos = await media.listForAnimal(id);

    try {
      const deleted = await repository.remove(id);
      if (!deleted) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
    } catch (error) {
      if (error.code === '23503') {
        throw new AppError(409, 'ANIMAL_COM_PEDIDO', 'Não é possível excluir um animal com pedidos de adoção vinculados.');
      }
      throw error;
    }

    // As linhas da galeria saem junto (ON DELETE CASCADE); os arquivos, aqui.
    await Promise.all(photos.map((photo) => storage.remove(photo.objeto_chave)));
    await audit.record({ actor, action: 'excluir', module: 'animals', entity: 'animal', entityId: id, before: current });
    return current;
  }

  // Envio de fotos: todos os arquivos são conferidos antes de gravar qualquer um. A primeira foto de um
  // animal sem principal vira a principal e passa a ser o foto_url (usado no site e no painel).
  async function addPhotos(id, files = [], actor = {}) {
    await getById(id);
    if (files.length === 0) {
      throw new AppError(422, 'ARQUIVO_INVALIDO', 'Envie ao menos uma foto.', [{ field: 'fotos', message: 'Envie ao menos uma foto.' }]);
    }
    const existing = await media.listForAnimal(id);
    if (existing.length + files.length > MAX_PHOTOS_PER_ANIMAL) {
      throw new AppError(422, 'LIMITE_DE_FOTOS', `Cada animal pode ter até ${MAX_PHOTOS_PER_ANIMAL} fotos.`, [
        { field: 'fotos', message: `Restam ${Math.max(0, MAX_PHOTOS_PER_ANIMAL - existing.length)} foto(s) para este animal.` },
      ]);
    }
    const invalid = files.find((file) => !detectImage(file.buffer));
    if (invalid) {
      throw new AppError(422, 'ARQUIVO_INVALIDO', 'Envie fotos em JPG, PNG ou WebP.', [
        { field: 'fotos', message: `"${invalid.originalname}" não é uma imagem JPG, PNG ou WebP.` },
      ]);
    }

    let hasPrincipal = existing.some((photo) => photo.principal);
    for (const file of files) {
      const saved = await storage.save(file.buffer);
      try {
        await media.create({ animalId: id, objetoChave: saved.key, mimeType: saved.mime, tamanhoBytes: saved.size, principal: !hasPrincipal });
      } catch (error) {
        await storage.remove(saved.key);
        throw error;
      }
      if (!hasPrincipal) {
        hasPrincipal = true;
        await repository.update(id, { foto_url: storage.urlFor(saved.key) });
      }
    }

    await audit.record({ actor, action: 'adicionar_fotos', module: 'animals', entity: 'animal', entityId: id, after: { quantidade: files.length } });
    return getDetail(id);
  }

  async function findPhoto(id, photoId) {
    const photo = await media.findById(photoId);
    if (!photo || photo.animal_id !== id) throw photoNotFound();
    return photo;
  }

  async function setPrincipalPhoto(id, photoId, actor = {}) {
    await getById(id);
    const photo = await findPhoto(id, photoId);
    await media.setPrincipal(id, photo.id);
    await repository.update(id, { foto_url: storage.urlFor(photo.objeto_chave) });
    await audit.record({ actor, action: 'definir_foto_principal', module: 'animals', entity: 'animal', entityId: id, after: { foto_id: photo.id } });
    return getDetail(id);
  }

  // Apagar a principal promove a próxima foto; sem fotos, o foto_url que apontava para ela é limpo.
  async function removePhoto(id, photoId, actor = {}) {
    const animal = await getById(id);
    const photo = await findPhoto(id, photoId);
    await media.remove(photo.id);
    await storage.remove(photo.objeto_chave);

    if (photo.principal) {
      const [next] = await media.listForAnimal(id);
      if (next) {
        await media.setPrincipal(id, next.id);
        await repository.update(id, { foto_url: storage.urlFor(next.objeto_chave) });
      } else if (animal.foto_url === storage.urlFor(photo.objeto_chave)) {
        await repository.update(id, { foto_url: null });
      }
    }

    await audit.record({ actor, action: 'remover_foto', module: 'animals', entity: 'animal', entityId: id, before: { foto_id: photo.id } });
    return getDetail(id);
  }

  return {
    list,
    listAll,
    listPublic,
    listPublicPage,
    getPublicById,
    listForExport,
    getById,
    getDetail,
    create,
    update,
    changeStatus,
    remove,
    addPhotos,
    setPrincipalPhoto,
    removePhoto,
  };
}

module.exports = { ...createAnimalService(), createAnimalService };
