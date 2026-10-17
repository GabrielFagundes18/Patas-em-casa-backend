/*
 * ============================================================================
 * ARQUIVO: volunteer-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE dos VOLUNTÁRIOS: lista e detalhe do painel; cadastro e edição
 *   (dados + áreas, numa transação, com auditoria); exclusão; e a INSCRIÇÃO
 *   PELO SITE, que entra como "inativo" até a equipe aprovar e devolve um protocolo.
 *
 * PRINCIPAIS ITENS:
 *   - EDITABLE_FIELDS.
 *   - notFound, emailInUse, formatProtocol, normalize (internas).
 *   - createVolunteerService(repository, deps) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/app-error, utils/pagination, db/transaction, ./volunteer-repository, audit/audit-service.
 *   - Usado por: ./volunteer-controller.js e modules/public/public-controller.js (apply).
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Transações.
const withTransaction = require('../../db/transaction');
// Banco.
const volunteerRepository = require('./volunteer-repository');
// Auditoria.
const auditService = require('../audit/audit-service');

// Campos editáveis (as áreas são tratadas à parte).
const EDITABLE_FIELDS = ['nome', 'email', 'telefone', 'status', 'data_inicio'];

// Erro 404: voluntário não encontrado.
function notFound() {
  return new AppError(404, 'VOLUNTARIO_NAO_ENCONTRADO', 'Voluntário não encontrado.');
}

// Erro 409: e-mail já cadastrado.
function emailInUse() {
  return new AppError(409, 'EMAIL_EM_USO', 'Já existe um voluntário com este e-mail.', [{ field: 'email', message: 'Use outro e-mail.' }]);
}

// Protocolo curto a partir do id. Ex.: "VOL-3B241101".
function formatProtocol(id) {
  return `VOL-${String(id).slice(0, 8).toUpperCase()}`;
}

/*
 * FUNÇÃO: normalize (interna)
 * O que faz: mantém só os campos editáveis; tira espaços; e-mail em minúsculas; telefone vazio → null.
 */
function normalize(payload) {
  const data = Object.fromEntries(Object.entries(payload).filter(([field]) => EDITABLE_FIELDS.includes(field)));
  if (typeof data.nome === 'string') data.nome = data.nome.trim();
  if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase();
  if (Object.hasOwn(data, 'telefone')) data.telefone = data.telefone?.trim() || null;
  return data;
}

/*
 * FUNÇÃO: createVolunteerService (fábrica)
 * Retorno: { list, getById, create, update, remove, apply }.
 */
function createVolunteerService(repository = volunteerRepository, {
  audit = auditService,
  transaction = withTransaction,
} = {}) {
  /*
   * list: filtros da query → repository.
   */
  async function list(query = {}) {
    return repository.list({
      ...parsePagination(query),
      q: query.q ? String(query.q).trim() : '',
      status: query.status,
      area: query.area,
      sort: query.sort,
      order: query.order?.toLowerCase(),
    });
  }

  /*
   * getById: voluntário ou 404.
   */
  async function getById(id) {
    const volunteer = await repository.findById(undefined, id);
    if (!volunteer) throw notFound();
    return volunteer;
  }

  /*
   * create: cadastro pelo painel (padrões: ativo, sem data de início, sem telefone), com áreas
   * sem repetição, numa transação. E-mail repetido (23505) → 409.
   * Detalhe: "return await" dentro do try é necessário para o catch capturar erros da Promise.
   */
  async function create(payload, actor = {}) {
    try {
      return await transaction(async (db) => {
        const id = await repository.create(db, { status: 'ativo', data_inicio: null, telefone: null, ...normalize(payload) });
        // new Set remove áreas repetidas.
        await repository.replaceAreas(db, id, [...new Set(payload.areas || [])]);
        const volunteer = await repository.findById(db, id);
        await audit.record({ actor, action: 'criar', module: 'volunteers', entity: 'voluntario', entityId: id, after: volunteer }, db);
        return volunteer;
      });
    } catch (error) {
      if (error.code === '23505') throw emailInUse();
      throw error;
    }
  }

  /*
   * update: edita dados e (se enviadas) as áreas, numa transação, auditando só o que mudou.
   * A comparação usa JSON.stringify para comparar também arrays (áreas) e datas.
   */
  async function update(id, payload, actor = {}) {
    try {
      return await transaction(async (db) => {
        const current = await repository.findById(db, id);
        if (!current) throw notFound();

        await repository.update(db, id, normalize(payload));
        // Áreas só são trocadas se vierem como array.
        if (Array.isArray(payload.areas)) await repository.replaceAreas(db, id, [...new Set(payload.areas)]);

        const volunteer = await repository.findById(db, id);
        const changed = [...EDITABLE_FIELDS, 'areas']
          .filter((field) => JSON.stringify(current[field]) !== JSON.stringify(volunteer[field]));
        if (changed.length > 0) {
          await audit.record({
            actor,
            action: 'editar',
            module: 'volunteers',
            entity: 'voluntario',
            entityId: id,
            before: Object.fromEntries(changed.map((field) => [field, current[field]])),
            after: Object.fromEntries(changed.map((field) => [field, volunteer[field]])),
          }, db);
        }
        return volunteer;
      });
    } catch (error) {
      if (error.code === '23505') throw emailInUse();
      throw error;
    }
  }

  /*
   * remove: exclui e audita (guardando só nome e status "antes").
   */
  async function remove(id, actor = {}) {
    const current = await getById(id);
    if (!(await repository.remove(id))) throw notFound();
    await audit.record({ actor, action: 'excluir', module: 'volunteers', entity: 'voluntario', entityId: id, before: { nome: current.nome, status: current.status } });
  }

  /*
   * apply: inscrição pelo site.
   * Retorno: { protocolo, status: 'recebida' } — igual para e-mail novo ou já cadastrado
   *   (não revela se a pessoa já estava na base).
   */
  // Inscrição pelo site: entra como "inativo" (aguardando triagem) até a equipe aprovar.
  // E-mail já cadastrado devolve o mesmo protocolo, sem revelar nem alterar o cadastro existente.
  async function apply(payload) {
    return transaction(async (db) => {
      const email = payload.email.trim().toLowerCase();
      const existingId = await repository.findIdByEmail(db, email);
      if (existingId) return { protocolo: formatProtocol(existingId), status: 'recebida' };

      const id = await repository.create(db, {
        nome: payload.nome.trim(),
        email,
        telefone: payload.telefone.trim(),
        status: 'inativo',
        data_inicio: null,
      });
      await repository.replaceAreas(db, id, [...new Set(payload.areas)]);
      // actor vazio: a ação veio do site, sem usuário logado.
      await audit.record({ actor: {}, action: 'inscricao_publica', module: 'volunteers', entity: 'voluntario', entityId: id }, db);
      return { protocolo: formatProtocol(id), status: 'recebida' };
    });
  }

  return { list, getById, create, update, remove, apply };
}

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createVolunteerService(), createVolunteerService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Painel: create/update gravam dados + áreas numa transação e auditam;
 *     remove exclui e audita.
 *   - Site: apply registra a inscrição como "inativa" (ou devolve o protocolo do
 *     cadastro existente) e audita como inscrição pública.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Transações envolvendo duas tabelas (dados + áreas).
 *   - "return await" dentro de try/catch.
 *   - Comparar arrays/objetos com JSON.stringify.
 *   - Formulários públicos que não revelam dados existentes.
 * ============================================================================
 */
