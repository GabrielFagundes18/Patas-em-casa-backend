/*
 * ============================================================================
 * ARQUIVO: story-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE das HISTÓRIAS DE ADOÇÃO: lista e detalhe do painel, criação (por
 *   padrão não publicada), edição (com auditoria de publicar/despublicar),
 *   exclusão e a lista pública do site (formato sem dados do adotante).
 *
 * PRINCIPAIS ITENS:
 *   - EDITABLE_FIELDS.
 *   - notFound, invalidLink, normalize, toPublicStory (internas).
 *   - createStoryService(repository, { audit }) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/app-error, utils/pagination, ./story-repository, ../audit/audit-service.
 *   - Usado por: ./story-controller.js e modules/public/public-controller.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Banco.
const storyRepository = require('./story-repository');
// Auditoria.
const auditService = require('../audit/audit-service');

// Campos editáveis.
const EDITABLE_FIELDS = ['autor_nome', 'texto', 'foto_url', 'publicado', 'animal_id', 'adotante_id'];

// Erro 404: história não encontrada.
function notFound() {
  return new AppError(404, 'HISTORIA_NAO_ENCONTRADA', 'História não encontrada.');
}

// Erro 422: animal ou adotante vinculado não existe (chave estrangeira).
function invalidLink() {
  return new AppError(422, 'VINCULO_INVALIDO', 'O animal ou adotante informado não existe.', [
    { field: 'animal_id', message: 'Escolha um animal e um adotante cadastrados, ou deixe em branco.' },
  ]);
}

/*
 * FUNÇÃO: normalize (interna)
 * O que faz: filtra os campos editáveis, tira espaços dos textos e transforma vazios em null
 *   (foto e vínculos).
 */
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

/*
 * FUNÇÃO: toPublicStory (interna)
 * O que faz: formato da história para o site, com o animal aninhado (ou null).
 */
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

/*
 * FUNÇÃO: createStoryService (fábrica)
 * Retorno: { list, getById, create, update, remove, listPublished }.
 */
function createStoryService(repository = storyRepository, { audit = auditService } = {}) {
  /*
   * list: filtros convertidos da query (publicado "true"/"false" → booleano).
   */
  async function list(query = {}) {
    return repository.list({
      ...parsePagination(query),
      q: query.q ? String(query.q).trim() : '',
      publicado: query.publicado === undefined ? undefined : query.publicado === 'true',
      animalId: query.animal_id,
      order: query.order?.toLowerCase(),
    });
  }

  /*
   * getById: uma história ou 404.
   */
  async function getById(id) {
    const story = await repository.findById(id);
    if (!story) throw notFound();
    return story;
  }

  /*
   * create: cria com valores padrão (sem foto, não publicada, sem vínculos), sobrescritos
   * pelos dados enviados ("...normalize(payload)" vem por último e vence).
   */
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

  /*
   * update: edita e audita. A ação auditada é "publicar"/"despublicar" quando o campo
   * "publicado" mudou; senão, "editar".
   */
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
        // Ternário dentro de ternário: mudou "publicado"? (está publicado agora? 'publicar' : 'despublicar') : 'editar'.
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

  /*
   * remove: confere se existe, exclui e audita.
   */
  async function remove(id, actor = {}) {
    await getById(id);
    if (!(await repository.remove(id))) throw notFound();
    await audit.record({ actor, action: 'excluir', module: 'stories', entity: 'historia', entityId: id });
  }

  /*
   * listPublished: lista pública paginada para o site.
   */
  async function listPublished(query = {}) {
    const { items, total } = await repository.listPublished(parsePagination(query));
    return { items: items.map(toPublicStory), total };
  }

  return { list, getById, create, update, remove, listPublished };
}

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createStoryService(), createStoryService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Painel: list/getById/create/update/remove (normalização + tradução do erro
 *   23503 + auditoria). Site: listPublished devolve só histórias publicadas no
 *   formato público.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Valores padrão com spread (o último objeto espalhado vence).
 *   - Moderação de conteúdo (rascunho → publicado).
 *   - Ternários aninhados (usar com moderação, pela legibilidade).
 * ============================================================================
 */
