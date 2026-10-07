const AppError = require('../../utils/app-error');
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
const { maskContactsInText, maskEmail, maskPhone } = require('../../utils/masking');
const { parsePagination } = require('../../utils/pagination');
const withTransaction = require('../../db/transaction');
const adopterRepository = require('./adopter-repository');
const auditService = require('../audit/audit-service');

const EDITABLE_FIELDS = ['nome', 'email', 'telefone', 'cidade', 'estado', 'endereco', 'status'];

function notFound() {
  return new AppError(404, 'ADOTANTE_NAO_ENCONTRADO', 'Adotante não encontrado.');
}

function buildFilters(query = {}) {
  return {
    q: query.q ? String(query.q).trim() : '',
    status: query.status,
    cidade: query.cidade ? String(query.cidade).trim() : undefined,
    estado: query.estado,
    sort: query.sort,
    order: query.order?.toLowerCase(),
  };
}

// Por padrão, contatos saem mascarados e o endereço é omitido (LGPD).
function toMasked(adopter) {
  const { endereco, ...rest } = adopter;
  return {
    ...rest,
    email: maskEmail(adopter.email),
    telefone: maskPhone(adopter.telefone),
    possui_endereco: adopter.possui_endereco ?? Boolean(endereco),
  };
}

function createAdopterService(repository = adopterRepository, {
  audit = auditService,
  transaction = withTransaction,
} = {}) {
  async function list(query = {}) {
    const { items, total } = await repository.list({ ...parsePagination(query), ...buildFilters(query) });
    return { items: items.map(toMasked), total };
  }

  async function getById(id) {
    const adopter = await repository.findById(undefined, id);
    if (!adopter) throw notFound();

    const history = await repository.findHistory(undefined, id);
    return {
      ...toMasked(adopter),
      historico: {
        pedidos: history.pedidos.map(({ observacoes, ...request }) => ({
          ...request,
          observacoes: maskContactsInText(observacoes),
        })),
        doacoes: history.doacoes.map(({ doador_email: email, ...donation }) => ({ ...donation, doador_email: maskEmail(email) })),
        historias: history.historias,
      },
    };
  }

  async function reveal(id, actor = {}) {
    const adopter = await repository.findById(undefined, id);
    if (!adopter) throw notFound();

    await audit.record({ actor, action: 'revelar_contato', module: 'adopters', entity: 'adotante', entityId: id });
    return { id, email: adopter.email, telefone: adopter.telefone, endereco: adopter.endereco };
  }

  async function update(id, payload, actor = {}) {
    const current = await repository.findById(undefined, id);
    if (!current) throw notFound();

    const changes = Object.fromEntries(
      Object.entries(payload)
        .filter(([field]) => EDITABLE_FIELDS.includes(field))
        .map(([field, value]) => [field, typeof value === 'string' ? value.trim() || null : value])
    );
    if (changes.email) changes.email = changes.email.toLowerCase();

    let adopter;
    try {
      adopter = await repository.update(id, changes);
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(409, 'EMAIL_EM_USO', 'Já existe um adotante com este e-mail.', [{ field: 'email', message: 'Use outro e-mail.' }]);
      }
      throw error;
    }

    const changed = Object.keys(changes).filter((field) => current[field] !== adopter[field]);
    if (changed.length > 0) {
      await audit.record({
        actor,
        action: 'editar',
        module: 'adopters',
        entity: 'adotante',
        entityId: id,
        before: Object.fromEntries(changed.map((field) => [field, current[field]])),
        after: Object.fromEntries(changed.map((field) => [field, adopter[field]])),
      });
    }

    return toMasked(adopter);
  }

  async function listForExport(query, { revealContacts }, actor = {}) {
    const rows = await repository.listForExport(buildFilters(query), MAX_EXPORT_ROWS);
    ensureExportLimit(rows.length);

    await audit.record({
      actor,
      action: revealContacts ? 'exportar_com_contatos' : 'exportar',
      module: 'adopters',
      entity: 'adotante',
      after: { linhas: rows.length },
    });

    return revealContacts ? rows : rows.map(toMasked);
  }

  // LGPD: todos os dados do titular em um único documento (portabilidade/acesso).
  async function exportTitularData(id, actor = {}) {
    const adopter = await repository.findById(undefined, id);
    if (!adopter) throw notFound();
    const history = await repository.findHistory(undefined, id);

    await audit.record({ actor, action: 'lgpd_exportar', module: 'lgpd', entity: 'adotante', entityId: id });
    return {
      gerado_em: new Date().toISOString(),
      titular: adopter,
      pedidos_adocao: history.pedidos,
      doacoes: history.doacoes,
      historias: history.historias,
    };
  }

  async function assertCanErase(db, id) {
    const adopter = await repository.findById(db, id, { forUpdate: true });
    if (!adopter) throw notFound();
    if (adopter.nome === repository.ANONYMIZED_NAME && adopter.email.endsWith('@anonimizado.invalid')) {
      throw new AppError(409, 'TITULAR_JA_ANONIMIZADO', 'Os dados deste titular já foram anonimizados.');
    }
    if ((await repository.countOpenRequests(db, id)) > 0) {
      throw new AppError(409, 'PEDIDOS_EM_ANDAMENTO', 'Encerre (aprove ou reprove) os pedidos em andamento antes de atender a esta solicitação.');
    }
  }

  // Anonimização irreversível: mantém pedidos, doações e estatísticas, sem identificar o titular.
  // A auditoria não guarda os valores antigos, para não recriar os dados apagados.
  async function anonymize(id, actor = {}) {
    return transaction(async (db) => {
      await assertCanErase(db, id);
      await repository.anonymize(db, id);
      await audit.record({
        actor,
        action: 'lgpd_anonimizar',
        module: 'lgpd',
        entity: 'adotante',
        entityId: id,
        after: { anonimizado: true },
      }, db);
      return { id, anonimizado: true };
    });
  }

  async function remove(id, actor = {}) {
    return transaction(async (db) => {
      await assertCanErase(db, id);
      await repository.remove(db, id);
      await audit.record({
        actor,
        action: 'lgpd_excluir',
        module: 'lgpd',
        entity: 'adotante',
        entityId: id,
        after: { excluido: true },
      }, db);
    });
  }

  return { list, getById, reveal, update, listForExport, exportTitularData, anonymize, remove };
}

module.exports = { ...createAdopterService(), createAdopterService };
