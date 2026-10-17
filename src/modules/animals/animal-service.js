/*
 * ============================================================================
 * ARQUIVO: animal-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE com as REGRAS DE NEGÓCIO dos ANIMAIS:
 *     - listagens do painel e do site (o site só vê disponíveis/urgentes);
 *     - perfil público (com aviso de "já adotado" / "em processo");
 *     - exportação com limite de linhas;
 *     - cadastro, edição e mudança de status (com regras de transição);
 *     - exclusão (impedida se houver pedido de adoção vinculado);
 *     - galeria de fotos (envio, foto principal, remoção);
 *     - auditoria de tudo o que muda.
 *
 * PRINCIPAIS ITENS:
 *   - PUBLIC_FIELDS, EDITABLE_FIELDS, MAX_PHOTOS_PER_ANIMAL.
 *   - normalizeTemperament, photoNotFound, parseOptionalBoolean, buildFilters, diff (internas).
 *   - createAnimalService(repository, deps): fábrica do service (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/app-error, utils/pagination, utils/csv, config/domain-values.
 *   - ./animal-repository, ./animal-media-repository, ./animal-status-rules.
 *   - ../audit/audit-service, integrations/storage/photo-storage.
 *   - Usado por: ./animal-controller.js, modules/public/public-controller.js e outros services.
 *   - Testado em: tests/unit/animal-service.test.js e animal-photos.test.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Limite e verificação de exportação.
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
// Banco: animais e fotos.
const animalRepository = require('./animal-repository');
const animalMediaRepository = require('./animal-media-repository');
// Auditoria.
const auditService = require('../audit/audit-service');
// Armazenamento de fotos e detector de formato.
const { createPhotoStorage, detectImage } = require('../../integrations/storage/photo-storage');
// Regras de mudança de status.
const { assertStatusTransition } = require('./animal-status-rules');

// Valores do domínio (renomeado para animalValues na desestruturação: "animal: animalValues").
const { animal: animalValues } = require('../../config/domain-values');

// Campos que o site público pode ver (sem datas internas de controle).
const PUBLIC_FIELDS = [
  'id', 'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado', 'temperamento',
];

// Campos que o painel pode editar.
const EDITABLE_FIELDS = [
  'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado', 'temperamento',
];

// Máximo de fotos por animal.
const MAX_PHOTOS_PER_ANIMAL = 12;

/*
 * FUNÇÃO: normalizeTemperament (interna)
 * O que faz: limpa a lista de traços: tira espaços, remove vazios e repetidos.
 * Retorno (array). Ex.: [' dócil', 'dócil', ''] → ['dócil'].
 * Detalhe: "new Set(lista)" remove repetidos; "[...set]" volta a ser array (mantendo a ordem).
 */
// Traços de temperamento: sem repetidos nem vazios, na ordem informada.
function normalizeTemperament(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

/*
 * FUNÇÃO: photoNotFound (interna)
 * O que faz: cria o erro 404 de foto não encontrada.
 */
function photoNotFound() {
  return new AppError(404, 'FOTO_NAO_ENCONTRADA', 'Foto não encontrada para este animal.');
}

/*
 * FUNÇÃO: parseOptionalBoolean (interna)
 * O que faz: converte "true"/true em true; qualquer outro valor em false; ausente → undefined.
 */
function parseOptionalBoolean(value) {
  if (value === undefined) return undefined;
  return value === true || value === 'true';
}

/*
 * FUNÇÃO: buildFilters (interna)
 * O que faz: converte a query string (textos) nos filtros tipados que o repository espera.
 * Parâmetros: query (objeto, opcional).
 * Retorno (objeto): q, especie, sexo, porte, status, castrado, vacinado, idadeMin, idadeMax, sort, order.
 */
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
    // Padrões: ordenar por data de entrada, decrescente.
    sort: query.sort || 'data_entrada',
    order: query.order?.toLowerCase() === 'asc' ? 'asc' : 'desc',
  };
}

/*
 * FUNÇÃO: diff (interna)
 * O que faz: compara o animal antes e depois e devolve só o que mudou.
 * Parâmetros: before (objeto) e after (objeto).
 * Retorno: { before: { campo: valorAntigo }, after: { campo: valorNovo } }.
 * Detalhe: String(...) compara como texto para tratar, ex., números e textos iguais como iguais.
 */
// Só os campos alterados entram na auditoria (antes e depois).
function diff(before, after) {
  const changed = EDITABLE_FIELDS.filter((field) => String(before[field]) !== String(after[field]));
  return {
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, after[field]])),
  };
}

/*
 * FUNÇÃO: createAnimalService (fábrica)
 * Parâmetros:
 *   - repository (padrão: animalRepository).
 *   - { audit, media, storage } (opcionais): auditoria, repository de fotos e armazenamento.
 * Retorno: objeto com todas as operações (veja o "return" no fim).
 */
function createAnimalService(repository = animalRepository, {
  audit = auditService,
  media = animalMediaRepository,
  storage = createPhotoStorage(),
} = {}) {
  // Converte uma linha de foto do banco no formato da API (com URL pública).
  function toPhoto(row) {
    return { id: row.id, url: storage.urlFor(row.objeto_chave), principal: row.principal, ordem: row.ordem };
  }

  // Devolve o animal com a lista "fotos" acrescentada.
  async function withPhotos(animal) {
    return { ...animal, fotos: (await media.listForAnimal(animal.id)).map(toPhoto) };
  }

  /*
   * list: lista paginada do painel. Junta paginação (page, pageSize, offset) e filtros num objeto só.
   */
  async function list(query = {}) {
    return repository.list({ ...parsePagination(query), ...buildFilters(query) });
  }

  /*
   * listAll: busca TODOS os animais que atendem aos filtros, página por página (100 por vez).
   * Retorno (array).
   */
  async function listAll(filters = {}) {
    const pageSize = 100;
    const items = [];
    let page = 1;
    let total = 0;

    // do...while: executa ao menos uma vez e repete enquanto ainda faltarem itens.
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

  /*
   * listPublic: todos os animais visíveis no site (disponíveis e urgentes).
   */
  async function listPublic() {
    return listAll({ statusIn: animalValues.publicStatus });
  }

  // Copia só os campos públicos do animal.
  function toPublicAnimal(animal) {
    return Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, animal[field]]));
  }

  /*
   * listPublicPage: página do catálogo do site.
   * O filtro "status" da URL é ignorado (status: undefined) e substituído pelos status públicos,
   * para o site nunca listar animais adotados ou inativos.
   */
  async function listPublicPage(query = {}) {
    const { items, total } = await repository.list({
      ...parsePagination(query),
      ...buildFilters({ ...query, status: undefined }),
      statusIn: animalValues.publicStatus,
    });
    return { items: items.map(toPublicAnimal), total };
  }

  /*
   * getPublicById: perfil público de um animal.
   * Retorno: o animal (campos públicos) com fotos { id, url, principal }.
   * Erros: 410 (Gone = "não está mais disponível") para adotado/em processo; 404 para inativo/inexistente.
   */
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
    // Separa "fotos" do resto e, nas fotos, mantém só id, url e principal (sem "ordem").
    // "id: photoId" renomeia a variável para não confundir com o "id" do animal.
    const { fotos, ...publicAnimal } = await withPhotos(toPublicAnimal(animal));
    return { ...publicAnimal, fotos: fotos.map(({ id: photoId, url, principal }) => ({ id: photoId, url, principal })) };
  }

  /*
   * listForExport: linhas para o CSV; lança 422 se passar do limite.
   */
  async function listForExport(query = {}) {
    const rows = await repository.listForExport(buildFilters(query), MAX_EXPORT_ROWS);
    ensureExportLimit(rows.length);
    return rows;
  }

  /*
   * getById: busca o animal ou lança 404.
   */
  async function getById(id) {
    const animal = await repository.findById(id);
    if (!animal) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
    return animal;
  }

  /*
   * getDetail: animal + fotos (tela de detalhes do painel).
   */
  async function getDetail(id) {
    return withPhotos(await getById(id));
  }

  /*
   * create: cadastra um animal.
   * Parâmetros: payload (corpo validado) e actor (autor, para auditoria e regras de cargo).
   * Retorno: o animal criado.
   */
  async function create(payload, actor = {}) {
    // Status inicial (padrão: disponível) e checagem de permissão para status especiais.
    const status = payload.status || 'disponivel';
    assertStatusTransition({ from: null, to: status, role: actor.role });

    // Normaliza os campos antes de gravar.
    const animal = await repository.create({
      nome: payload.nome.trim(),
      especie: payload.especie,
      // Raça vazia vira null.
      raca: payload.raca?.trim() || null,
      sexo: payload.sexo || null,
      // Idade vazia/ausente vira null; senão, número.
      idade_anos: payload.idade_anos === undefined || payload.idade_anos === null || payload.idade_anos === ''
        ? null
        : Number(payload.idade_anos),
      porte: payload.porte || null,
      status,
      descricao: payload.descricao || null,
      foto_url: payload.foto_url || null,
      // Sem data de entrada: hoje (AAAA-MM-DD).
      data_entrada: payload.data_entrada || new Date().toISOString().slice(0, 10),
      // "??" só usa false se o valor for null/undefined (preserva um false enviado).
      castrado: payload.castrado ?? false,
      vacinado: payload.vacinado ?? false,
      temperamento: normalizeTemperament(payload.temperamento),
    });

    // Auditoria do cadastro (com os dados "depois").
    await audit.record({ actor, action: 'criar', module: 'animals', entity: 'animal', entityId: animal.id, after: animal });
    return animal;
  }

  /*
   * update: edita um animal (inclusive status).
   * Parâmetros: id, payload (campos enviados + motivo opcional), actor.
   * Retorno: o animal atualizado.
   */
  async function update(id, payload, actor = {}) {
    // Estado atual (lança 404 se não existir).
    const current = await getById(id);
    // Só os campos editáveis do corpo (ignora "motivo" e qualquer outro).
    const changes = Object.fromEntries(Object.entries(payload).filter(([field]) => EDITABLE_FIELDS.includes(field)));

    // Normalizações: nome sem espaços nas pontas; idade em número (ou null se vazia); raça vazia → null.
    if (typeof changes.nome === 'string') changes.nome = changes.nome.trim();
    if (changes.idade_anos !== undefined && changes.idade_anos !== null && changes.idade_anos !== '') {
      changes.idade_anos = Number(changes.idade_anos);
    } else if (changes.idade_anos === '') {
      changes.idade_anos = null;
    }
    if (Object.hasOwn(changes, 'raca') && !changes.raca) changes.raca = null;
    if (Object.hasOwn(changes, 'temperamento')) changes.temperamento = normalizeTemperament(changes.temperamento);

    // Mudou o status? Confere a regra de transição (pode lançar 403/409/422).
    if (changes.status && changes.status !== current.status) {
      assertStatusTransition({ from: current.status, to: changes.status, role: actor.role, motivo: payload.motivo });
    }

    const animal = await repository.update(id, changes);
    if (!animal) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');

    // Auditoria só se algo realmente mudou. A ação é "alterar_status" quando o status está entre as mudanças.
    const { before, after } = diff(current, animal);
    if (Object.keys(after).length > 0) {
      await audit.record({
        actor,
        action: before.status !== undefined ? 'alterar_status' : 'editar',
        module: 'animals',
        entity: 'animal',
        entityId: id,
        before,
        // O motivo (se houver) vai junto no "depois".
        after: payload.motivo ? { ...after, motivo: payload.motivo } : after,
      });
    }

    return animal;
  }

  /*
   * changeStatus: atalho para update só com status e motivo.
   */
  async function changeStatus(id, { status, motivo }, actor = {}) {
    return update(id, { status, motivo }, actor);
  }

  /*
   * remove: exclui o animal e os arquivos das fotos.
   * Retorno: o animal como estava antes de excluir.
   * Erro 409 se houver pedido de adoção ligado ao animal.
   */
  async function remove(id, actor = {}) {
    const current = await getById(id);
    // Lista as fotos ANTES de excluir (depois as linhas somem junto com o animal).
    const photos = await media.listForAnimal(id);

    try {
      const deleted = await repository.remove(id);
      if (!deleted) throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
    } catch (error) {
      // Código 23503 do PostgreSQL = violação de chave estrangeira (outra tabela aponta para este animal).
      if (error.code === '23503') {
        throw new AppError(409, 'ANIMAL_COM_PEDIDO', 'Não é possível excluir um animal com pedidos de adoção vinculados.');
      }
      throw error;
    }

    // As linhas da galeria saem junto (ON DELETE CASCADE); os arquivos, aqui.
    // Promise.all executa as remoções em paralelo e espera todas terminarem.
    await Promise.all(photos.map((photo) => storage.remove(photo.objeto_chave)));
    await audit.record({ actor, action: 'excluir', module: 'animals', entity: 'animal', entityId: id, before: current });
    return current;
  }

  /*
   * addPhotos: adiciona fotos à galeria.
   * Parâmetros: id, files (array do multer: { buffer, originalname, ... }), actor.
   * Retorno: o animal com as fotos (getDetail).
   */
  // Envio de fotos: todos os arquivos são conferidos antes de gravar qualquer um. A primeira foto de um
  // animal sem principal vira a principal e passa a ser o foto_url (usado no site e no painel).
  async function addPhotos(id, files = [], actor = {}) {
    // O animal precisa existir.
    await getById(id);
    if (files.length === 0) {
      throw new AppError(422, 'ARQUIVO_INVALIDO', 'Envie ao menos uma foto.', [{ field: 'fotos', message: 'Envie ao menos uma foto.' }]);
    }
    // Limite total de fotos por animal.
    const existing = await media.listForAnimal(id);
    if (existing.length + files.length > MAX_PHOTOS_PER_ANIMAL) {
      throw new AppError(422, 'LIMITE_DE_FOTOS', `Cada animal pode ter até ${MAX_PHOTOS_PER_ANIMAL} fotos.`, [
        { field: 'fotos', message: `Restam ${Math.max(0, MAX_PHOTOS_PER_ANIMAL - existing.length)} foto(s) para este animal.` },
      ]);
    }
    // Confere o formato real de TODOS os arquivos antes de gravar o primeiro.
    const invalid = files.find((file) => !detectImage(file.buffer));
    if (invalid) {
      throw new AppError(422, 'ARQUIVO_INVALIDO', 'Envie fotos em JPG, PNG ou WebP.', [
        { field: 'fotos', message: `"${invalid.originalname}" não é uma imagem JPG, PNG ou WebP.` },
      ]);
    }

    // Já existe foto principal?
    let hasPrincipal = existing.some((photo) => photo.principal);
    // Um arquivo por vez (for...of com await = em sequência, preservando a ordem).
    for (const file of files) {
      // Grava no disco.
      const saved = await storage.save(file.buffer);
      try {
        // Registra no banco; vira principal se ainda não houver.
        await media.create({ animalId: id, objetoChave: saved.key, mimeType: saved.mime, tamanhoBytes: saved.size, principal: !hasPrincipal });
      } catch (error) {
        // Falhou no banco: apaga o arquivo para não deixar "lixo" no disco.
        await storage.remove(saved.key);
        throw error;
      }
      // Primeira principal: atualiza também o foto_url do animal.
      if (!hasPrincipal) {
        hasPrincipal = true;
        await repository.update(id, { foto_url: storage.urlFor(saved.key) });
      }
    }

    await audit.record({ actor, action: 'adicionar_fotos', module: 'animals', entity: 'animal', entityId: id, after: { quantidade: files.length } });
    return getDetail(id);
  }

  /*
   * findPhoto: busca a foto e confere se ela é DESTE animal (senão, 404).
   */
  async function findPhoto(id, photoId) {
    const photo = await media.findById(photoId);
    if (!photo || photo.animal_id !== id) throw photoNotFound();
    return photo;
  }

  /*
   * setPrincipalPhoto: define a foto principal e atualiza o foto_url do animal.
   */
  async function setPrincipalPhoto(id, photoId, actor = {}) {
    await getById(id);
    const photo = await findPhoto(id, photoId);
    await media.setPrincipal(id, photo.id);
    await repository.update(id, { foto_url: storage.urlFor(photo.objeto_chave) });
    await audit.record({ actor, action: 'definir_foto_principal', module: 'animals', entity: 'animal', entityId: id, after: { foto_id: photo.id } });
    return getDetail(id);
  }

  /*
   * removePhoto: remove uma foto (banco + disco) e ajusta a principal se preciso.
   */
  // Apagar a principal promove a próxima foto; sem fotos, o foto_url que apontava para ela é limpo.
  async function removePhoto(id, photoId, actor = {}) {
    const animal = await getById(id);
    const photo = await findPhoto(id, photoId);
    await media.remove(photo.id);
    await storage.remove(photo.objeto_chave);

    if (photo.principal) {
      // Desestruturação de array: "next" = primeira foto restante (ou undefined).
      const [next] = await media.listForAnimal(id);
      if (next) {
        await media.setPrincipal(id, next.id);
        await repository.update(id, { foto_url: storage.urlFor(next.objeto_chave) });
      } else if (animal.foto_url === storage.urlFor(photo.objeto_chave)) {
        // Não sobrou foto e o foto_url apontava para a removida: limpa.
        await repository.update(id, { foto_url: null });
      }
    }

    await audit.record({ actor, action: 'remover_foto', module: 'animals', entity: 'animal', entityId: id, before: { foto_id: photo.id } });
    return getDetail(id);
  }

  // Operações disponíveis do service.
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

// Exporta uma instância pronta e a fábrica (para os testes).
module.exports = { ...createAnimalService(), createAnimalService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Listagens: buildFilters + parsePagination → repository; o site recebe só
 *     campos e status públicos.
 *   - Cadastro/edição: normaliza dados → confere a transição de status →
 *     grava → audita só o que mudou.
 *   - Exclusão: bloqueada (409) se houver pedido de adoção; remove os arquivos.
 *   - Fotos: valida todas → grava uma a uma → mantém sempre uma principal e o
 *     foto_url do animal em sincronia.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Camada de serviço e regras de negócio.
 *   - Normalização de dados antes de gravar.
 *   - Auditoria com "diff" (antes x depois).
 *   - Erros do banco (código 23503, chave estrangeira) traduzidos em mensagens.
 *   - Promise.all, do...while, Set para remover duplicados.
 *   - Status HTTP 404, 409, 410 e 422.
 * ============================================================================
 */
