/*
 * ============================================================================
 * ARQUIVO: donation-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE das DOAÇÕES no painel: listar (e-mail mascarado), detalhar,
 *   registrar manualmente, editar (com bloqueios para canceladas e online),
 *   resumo por status/forma de pagamento/tipo, série mensal e exportação —
 *   tudo com auditoria das mudanças.
 *
 * PRINCIPAIS ITENS:
 *   - EDITABLE_FIELDS.
 *   - notFound, toDonation, toBreakdown, buildFilters, invalidAdopter (internas).
 *   - createDonationService(repository, { audit }) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/app-error, utils/csv, utils/masking, utils/pagination.
 *   - ./donation-repository, ../audit/audit-service.
 *   - Usado por: ./donation-controller.js. Testado em tests/unit/donation-service.test.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Limite de exportação.
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
// Mascaramento de e-mail.
const { maskEmail } = require('../../utils/masking');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Banco.
const donationRepository = require('./donation-repository');
// Auditoria.
const auditService = require('../audit/audit-service');

// Campos que podem ser editados.
const EDITABLE_FIELDS = ['adotante_id', 'doador_nome', 'doador_email', 'tipo', 'valor', 'metodo', 'status', 'data'];

// Erro 404: doação não encontrada.
function notFound() {
  return new AppError(404, 'DOACAO_NAO_ENCONTRADA', 'Doação não encontrada.');
}

/*
 * FUNÇÃO: toDonation (interna)
 * O que faz: formato da doação para a API: valor como número e e-mail mascarado (se pedido).
 * Parâmetros: row (linha do banco) e { maskContact } (boolean).
 */
// numeric/bigint chegam do PostgreSQL como texto; a API devolve número (contrato).
function toDonation(row, { maskContact = false } = {}) {
  return {
    ...row,
    valor: Number(row.valor),
    doador_email: maskContact ? maskEmail(row.doador_email) : row.doador_email,
  };
}

/*
 * FUNÇÃO: toBreakdown (interna)
 * O que faz: converte quantidade e total de cada grupo do resumo em números.
 */
function toBreakdown(rows) {
  return rows.map((row) => ({ chave: row.chave, quantidade: Number(row.quantidade), total: Number(row.total) }));
}

/*
 * FUNÇÃO: buildFilters (interna) — query string → filtros do repository.
 */
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

// Erro 422: o adotante informado não existe (violação de chave estrangeira no banco).
function invalidAdopter() {
  return new AppError(422, 'ADOTANTE_INVALIDO', 'O adotante informado não existe.', [
    { field: 'adotante_id', message: 'Escolha um adotante cadastrado ou deixe em branco.' },
  ]);
}

/*
 * FUNÇÃO: createDonationService (fábrica)
 * Retorno: { list, getById, create, update, summary, monthly, listForExport }.
 */
function createDonationService(repository = donationRepository, { audit = auditService } = {}) {
  /*
   * list: página de doações com e-mail mascarado.
   */
  async function list(query = {}) {
    const { items, total } = await repository.list({ ...parsePagination(query), ...buildFilters(query) });
    return { items: items.map((row) => toDonation(row, { maskContact: true })), total };
  }

  /*
   * getById: uma doação (sem máscara, para a tela de edição) ou 404.
   */
  async function getById(id) {
    const donation = await repository.findById(id);
    if (!donation) throw notFound();
    return toDonation(donation);
  }

  /*
   * create: registra uma doação manual (padrão: status "confirmada").
   */
  async function create(payload, actor = {}) {
    let donation;
    try {
      donation = await repository.create({
        adotante_id: payload.adotante_id || null,
        doador_nome: payload.doador_nome.trim(),
        // "?." evita erro se não houver e-mail; vazio vira null.
        doador_email: payload.doador_email?.trim().toLowerCase() || null,
        tipo: payload.tipo,
        valor: Number(payload.valor),
        metodo: payload.metodo || null,
        status: payload.status || 'confirmada',
        data: payload.data || null,
      });
    } catch (error) {
      // 23503 = chave estrangeira: o adotante_id não existe.
      if (error.code === '23503') throw invalidAdopter();
      throw error;
    }

    await audit.record({ actor, action: 'criar', module: 'donations', entity: 'doacao', entityId: donation.id, after: donation });
    return toDonation(donation);
  }

  /*
   * update: edita uma doação manual.
   * Bloqueios (409): doação cancelada e doação online (controlada pelo Mercado Pago).
   */
  async function update(id, payload, actor = {}) {
    const current = await repository.findById(id);
    if (!current) throw notFound();
    if (current.status === 'cancelada') {
      throw new AppError(409, 'DOACAO_CANCELADA', 'Doações canceladas não podem ser alteradas; registre uma nova doação.');
    }
    // Doação online: o estado vem do Mercado Pago (webhooks); edição manual criaria divergência.
    if (current.gateway) {
      throw new AppError(409, 'DOACAO_ONLINE', 'Doações online são atualizadas automaticamente pelo Mercado Pago.');
    }

    // Só campos editáveis, normalizados.
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

    // Auditoria só do que mudou (comparando como texto para tratar "10" e 10 como iguais).
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

  /*
   * summary: resumo do período (de/até) + arrecadado no mês atual.
   * Retorno: { periodo, total_confirmado, arrecadado_mes_atual, por_status, por_metodo, por_tipo }.
   */
  async function summary(query = {}) {
    const filters = { de: query.de, ate: query.ate };
    const [breakdown, kpis] = await Promise.all([repository.summary(filters), repository.kpis()]);
    // Grupo "confirmada" (pode não existir → total 0).
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

  /*
   * monthly: série mensal (padrão: 12 meses), com o mês como "AAAA-MM".
   */
  async function monthly(query = {}) {
    const months = query.meses ? Number(query.meses) : 12;
    const rows = await repository.monthly(months);
    return rows.map((row) => ({
      mes: new Date(row.mes).toISOString().slice(0, 7),
      total: Number(row.total),
      quantidade: Number(row.quantidade),
    }));
  }

  /*
   * listForExport: linhas do CSV (e-mail mascarado), com limite e auditoria.
   */
  async function listForExport(query = {}, actor = {}) {
    const rows = await repository.listForExport(buildFilters(query), MAX_EXPORT_ROWS);
    ensureExportLimit(rows.length);
    await audit.record({ actor, action: 'exportar', module: 'donations', entity: 'doacao', after: { linhas: rows.length } });
    return rows.map((row) => toDonation(row, { maskContact: true }));
  }

  return { list, getById, create, update, summary, monthly, listForExport };
}

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createDonationService(), createDonationService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Leituras: valores convertidos em número; e-mails mascarados nas listas/exportação.
 *   - Cadastro/edição: normaliza, trata adotante inexistente (23503 → 422),
 *     bloqueia doações canceladas e online, audita o que mudou.
 *   - Relatórios: resumo por grupos e série mensal das views do banco.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Tipos numéricos do PostgreSQL chegando como texto no Node (e por que converter).
 *   - Regras que impedem editar dados controlados por um sistema externo.
 *   - Tradução de erros do banco em mensagens de negócio.
 * ============================================================================
 */
