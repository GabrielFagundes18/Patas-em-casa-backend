const AppError = require('../../utils/app-error');
const { parsePagination } = require('../../utils/pagination');
const storyRepository = require('../../repositories/stories/story-repository');
const auditService = require('../audit/audit-service');

const EDITABLE_FIELDS = ['autor_nome', 'texto', 'foto_url', 'publicado', 'animal_id', 'adotante_id'];

function notFound() {
  return new AppError(404, 'HISTORIA_NAO_ENCONTRADA', 'História não encontrada.');
}

function invalidLink() {
  return new AppError(422, 'VINCULO_INVALIDO', 'O animal ou adotante informado não existe.', [
    { field: 'animal_id', message: 'Escolha um animal e um adotante cadastrados, ou deixe em branco.' },
  ]);
}

function normalize(payload) {
  const data = Object.fromEntries(Object.entries(payload).filter(([field]) => EDITABLE_FIELDS.includes(field)));
  for (const field of ['autor_nome', 'texto']) {
    if (typeof data[field] === 'string') data[field] = data[field].trim();
  }
  for (const field of ['foto_url', 'animal_id', 'adotante_id']) {
    if (Object.hasOwn(data, field)) data[field] = data[field] || null;
  }
  return data;
}

function toPublicStory(row) {
  return {
    id: row.id,
    autor_nome: row.autor_nome,
    texto: row.texto,
    foto_url: row.foto_url,
    criado_em: row.criado_em,
    animal: row.animal_id
      ? { id: row.animal_id, nome: row.animal_nome, especie: row.animal_especie, foto_url: row.animal_foto_url }
      : null,
  };
}

function createStoryService(repository = storyRepository, { audit = auditService } = {}) {
  async function list(query = {}) {
    return repository.list({
      ...parsePagination(query),
      q: query.q ? String(query.q).trim() : '',
      publicado: query.publicado === undefined ? undefined : query.publicado === 'true',
      animalId: query.animal_id,
      order: query.order?.toLowerCase(),
    });
  }

  async function getById(id) {
    const story = await repository.findById(id);
    if (!story) throw notFound();
    return story;
  }

  async function create(payload, actor = {}) {
    let story;
    try {
      story = await repository.create({
        foto_url: null,
        publicado: false,
        animal_id: null,
        adotante_id: null,
        ...normalize(payload),
      });
    } catch (error) {
      if (error.code === '23503') throw invalidLink();
      throw error;
    }
    await audit.record({ actor, action: 'criar', module: 'stories', entity: 'historia', entityId: story.id, after: { publicado: story.publicado } });
    return story;
  }

  async function update(id, payload, actor = {}) {
    const current = await getById(id);
    let story;
    try {
      story = await repository.update(id, normalize(payload));
    } catch (error) {
      if (error.code === '23503') throw invalidLink();
      throw error;
    }

    const changed = EDITABLE_FIELDS.filter((field) => current[field] !== story[field]);
    if (changed.length > 0) {
      await audit.record({
        actor,
        action: current.publicado !== story.publicado ? (story.publicado ? 'publicar' : 'despublicar') : 'editar',
        module: 'stories',
        entity: 'historia',
        entityId: id,
        before: Object.fromEntries(changed.map((field) => [field, current[field]])),
        after: Object.fromEntries(changed.map((field) => [field, story[field]])),
      });
    }
    return story;
  }

  async function remove(id, actor = {}) {
    await getById(id);
    if (!(await repository.remove(id))) throw notFound();
    await audit.record({ actor, action: 'excluir', module: 'stories', entity: 'historia', entityId: id });
  }

  async function listPublished(query = {}) {
    const { items, total } = await repository.listPublished(parsePagination(query));
    return { items: items.map(toPublicStory), total };
  }

  return { list, getById, create, update, remove, listPublished };
}

module.exports = { ...createStoryService(), createStoryService };
