const AppError = require('../../utils/app-error');
const { parsePagination } = require('../../utils/pagination');
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
const animalRepository = require('../../repositories/animals/animal-repository');
const auditService = require('../audit/audit-service');
const { assertStatusTransition } = require('./animal-status-rules');

const { animal: animalValues } = require('../../config/domain-values');

// Campos que o site público pode ver (sem datas internas de controle).
const PUBLIC_FIELDS = [
  'id', 'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado',
];

const EDITABLE_FIELDS = [
  'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado',
];

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

function createAnimalService(repository = animalRepository, { audit = auditService } = {}) {
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

  async function getPublicById(id) {
    const animal = await repository.findById(id);
    if (!animal || !animalValues.publicStatus.includes(animal.status)) {
      throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado ou indisponível para adoção.');
    }
    return toPublicAnimal(animal);
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

    try {
      const deleted = await repository.remove(id);
      if (!deleted) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
    } catch (error) {
      if (error.code === '23503') {
        throw new AppError(409, 'ANIMAL_COM_PEDIDO', 'Não é possível excluir um animal com pedidos de adoção vinculados.');
      }
      throw error;
    }

    await audit.record({ actor, action: 'excluir', module: 'animals', entity: 'animal', entityId: id, before: current });
    return current;
  }

  return {
    list,
    listAll,
    listPublic,
    listPublicPage,
    getPublicById,
    listForExport,
    getById,
    create,
    update,
    changeStatus,
    remove,
  };
}

module.exports = { ...createAnimalService(), createAnimalService };
