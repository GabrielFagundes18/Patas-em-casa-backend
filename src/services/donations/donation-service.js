const AppError = require('../../utils/app-error');
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
const { maskEmail } = require('../../utils/masking');
const { parsePagination } = require('../../utils/pagination');
const donationRepository = require('../../repositories/donations/donation-repository');
const auditService = require('../audit/audit-service');

const EDITABLE_FIELDS = ['adotante_id', 'doador_nome', 'doador_email', 'tipo', 'valor', 'metodo', 'status', 'data'];

function notFound() {
  return new AppError(404, 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada.');
}

// numeric/bigint chegam do PostgreSQL como texto; a API devolve número (contrato).
function toDonation(row, { maskContact = false } = {}) {
  return {
    ...row,
    valor: Number(row.valor),
    doador_email: maskContact ? maskEmail(row.doador_email) : row.doador_email,
  };
}

function toBreakdown(rows) {
  return rows.map((row) => ({ chave: row.chave, quantidade: Number(row.quantidade), total: Number(row.total) }));
}

function buildFilters(query = {}) {
  return {
    q: query.q ? String(query.q).trim() : '',
    tipo: query.tipo,
    metodo: query.metodo,
    status: query.status,
    adotanteId: query.adotante_id,
    de: query.de,
    ate: query.ate,
    sort: query.sort,
    order: query.order?.toLowerCase(),
  };
}

function invalidAdopter() {
  return new AppError(422, 'ADOTANTE_INVALIDO', 'O adotante informado não existe.', [
    { field: 'adotante_id', message: 'Escolha um adotante cadastrado ou deixe em branco.' },
  ]);
}

function createDonationService(repository = donationRepository, { audit = auditService } = {}) {
  async function list(query = {}) {
    const { items, total } = await repository.list({ ...parsePagination(query), ...buildFilters(query) });
    return { items: items.map((row) => toDonation(row, { maskContact: true })), total };
  }

  async function getById(id) {
    const donation = await repository.findById(id);
    if (!donation) throw notFound();
    return toDonation(donation);
  }

  async function create(payload, actor = {}) {
    let donation;
    try {
      donation = await repository.create({
        adotante_id: payload.adotante_id || null,
        doador_nome: payload.doador_nome.trim(),
        doador_email: payload.doador_email?.trim().toLowerCase() || null,
        tipo: payload.tipo,
        valor: Number(payload.valor),
        metodo: payload.metodo || null,
        status: payload.status || 'confirmada',
        data: payload.data || null,
      });
    } catch (error) {
      if (error.code === '23503') throw invalidAdopter();
      throw error;
    }

    await audit.record({ actor, action: 'criar', module: 'donations', entity: 'doacao', entityId: donation.id, after: donation });
    return toDonation(donation);
  }

  async function update(id, payload, actor = {}) {
    const current = await repository.findById(id);
    if (!current) throw notFound();
    if (current.status === 'cancelada') {
      throw new AppError(409, 'DOACAO_CANCELADA', 'Doações canceladas não podem ser alteradas; registre uma nova doação.');
    }

    const changes = Object.fromEntries(Object.entries(payload).filter(([field]) => EDITABLE_FIELDS.includes(field)));
    if (typeof changes.doador_nome === 'string') changes.doador_nome = changes.doador_nome.trim();
    if (Object.hasOwn(changes, 'doador_email')) changes.doador_email = changes.doador_email?.trim().toLowerCase() || null;
    if (changes.valor !== undefined) changes.valor = Number(changes.valor);
    if (Object.hasOwn(changes, 'adotante_id')) changes.adotante_id = changes.adotante_id || null;

    let donation;
    try {
      donation = await repository.update(id, changes);
    } catch (error) {
      if (error.code === '23503') throw invalidAdopter();
      throw error;
    }

    const changed = Object.keys(changes).filter((field) => String(current[field]) !== String(donation[field]));
    if (changed.length > 0) {
      await audit.record({
        actor,
        action: changes.status && changes.status !== current.status ? 'alterar_status' : 'editar',
        module: 'donations',
        entity: 'doacao',
        entityId: id,
        before: Object.fromEntries(changed.map((field) => [field, current[field]])),
        after: Object.fromEntries(changed.map((field) => [field, donation[field]])),
      });
    }

    return toDonation(donation);
  }

  async function summary(query = {}) {
    const filters = { de: query.de, ate: query.ate };
    const [breakdown, kpis] = await Promise.all([repository.summary(filters), repository.kpis()]);
    const confirmed = breakdown.byStatus.find((row) => row.chave === 'confirmada');

    return {
      periodo: { de: query.de || null, ate: query.ate || null },
      total_confirmado: confirmed ? Number(confirmed.total) : 0,
      arrecadado_mes_atual: Number(kpis.doacoes_mes_atual),
      por_status: toBreakdown(breakdown.byStatus),
      por_metodo: toBreakdown(breakdown.byMethod),
      por_tipo: toBreakdown(breakdown.byType),
    };
  }

  async function monthly(query = {}) {
    const months = query.meses ? Number(query.meses) : 12;
    const rows = await repository.monthly(months);
    return rows.map((row) => ({
      mes: new Date(row.mes).toISOString().slice(0, 7),
      total: Number(row.total),
      quantidade: Number(row.quantidade),
    }));
  }

  async function listForExport(query = {}, actor = {}) {
    const rows = await repository.listForExport(buildFilters(query), MAX_EXPORT_ROWS);
    ensureExportLimit(rows.length);
    await audit.record({ actor, action: 'exportar', module: 'donations', entity: 'doacao', after: { linhas: rows.length } });
    return rows.map((row) => toDonation(row, { maskContact: true }));
  }

  return { list, getById, create, update, summary, monthly, listForExport };
}

module.exports = { ...createDonationService(), createDonationService };
