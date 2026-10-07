const AppError = require('../../utils/app-error');
const { parsePagination } = require('../../utils/pagination');
const withTransaction = require('../../db/transaction');
const volunteerRepository = require('../../repositories/volunteers/volunteer-repository');
const auditService = require('../../modules/audit/audit-service');

const EDITABLE_FIELDS = ['nome', 'email', 'telefone', 'status', 'data_inicio'];

function notFound() {
  return new AppError(404, 'VOLUNTARIO_NAO_ENCONTRADO', 'Voluntário não encontrado.');
}

function emailInUse() {
  return new AppError(409, 'EMAIL_EM_USO', 'Já existe um voluntário com este e-mail.', [{ field: 'email', message: 'Use outro e-mail.' }]);
}

function formatProtocol(id) {
  return `VOL-${String(id).slice(0, 8).toUpperCase()}`;
}

function normalize(payload) {
  const data = Object.fromEntries(Object.entries(payload).filter(([field]) => EDITABLE_FIELDS.includes(field)));
  if (typeof data.nome === 'string') data.nome = data.nome.trim();
  if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase();
  if (Object.hasOwn(data, 'telefone')) data.telefone = data.telefone?.trim() || null;
  return data;
}

function createVolunteerService(repository = volunteerRepository, {
  audit = auditService,
  transaction = withTransaction,
} = {}) {
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

  async function getById(id) {
    const volunteer = await repository.findById(undefined, id);
    if (!volunteer) throw notFound();
    return volunteer;
  }

  async function create(payload, actor = {}) {
    try {
      return await transaction(async (db) => {
        const id = await repository.create(db, { status: 'ativo', data_inicio: null, telefone: null, ...normalize(payload) });
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

  async function update(id, payload, actor = {}) {
    try {
      return await transaction(async (db) => {
        const current = await repository.findById(db, id);
        if (!current) throw notFound();

        await repository.update(db, id, normalize(payload));
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

  async function remove(id, actor = {}) {
    const current = await getById(id);
    if (!(await repository.remove(id))) throw notFound();
    await audit.record({ actor, action: 'excluir', module: 'volunteers', entity: 'voluntario', entityId: id, before: { nome: current.nome, status: current.status } });
  }

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
      await audit.record({ actor: {}, action: 'inscricao_publica', module: 'volunteers', entity: 'voluntario', entityId: id }, db);
      return { protocolo: formatProtocol(id), status: 'recebida' };
    });
  }

  return { list, getById, create, update, remove, apply };
}

module.exports = { ...createVolunteerService(), createVolunteerService };
