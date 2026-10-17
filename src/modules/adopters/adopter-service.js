/*
 * ============================================================================
 * ARQUIVO: adopter-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE com as REGRAS DOS ADOTANTES, com foco na LGPD:
 *     - por padrão, e-mail e telefone saem MASCARADOS e o endereço é omitido;
 *     - "revelar" mostra os dados completos e grava auditoria;
 *     - edição normaliza os dados e audita só o que mudou;
 *     - exportação CSV (com ou sem contatos) é auditada;
 *     - direitos do titular: exportar todos os dados, anonimizar ou excluir
 *       (só sem pedidos em andamento, dentro de transação, com auditoria).
 *
 * PRINCIPAIS ITENS:
 *   - EDITABLE_FIELDS; notFound, buildFilters, toMasked (internas).
 *   - createAdopterService(repository, deps) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/app-error, utils/csv, utils/masking, utils/pagination, db/transaction.
 *   - ./adopter-repository, ../audit/audit-service.
 *   - Usado por: ./adopter-controller.js. Testado em tests/unit/adopter-service.test.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Limite de exportação.
const { MAX_EXPORT_ROWS, ensureExportLimit } = require('../../utils/csv');
// Mascaramento de dados pessoais.
const { maskContactsInText, maskEmail, maskPhone } = require('../../utils/masking');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Transações.
const withTransaction = require('../../db/transaction');
// Banco.
const adopterRepository = require('./adopter-repository');
// Auditoria.
const auditService = require('../audit/audit-service');

// Campos editáveis.
const EDITABLE_FIELDS = ['nome', 'email', 'telefone', 'cidade', 'estado', 'endereco', 'status'];

/*
 * FUNÇÃO: notFound (interna)
 * O que faz: cria o erro 404 de adotante não encontrado.
 */
function notFound() {
  return new AppError(404, 'ADOTANTE_NAO_ENCONTRADO', 'Adotante não encontrado.');
}

/*
 * FUNÇÃO: buildFilters (interna)
 * O que faz: converte a query string nos filtros do repository.
 */
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

/*
 * FUNÇÃO: toMasked (interna)
 * O que faz: devolve o adotante com e-mail/telefone mascarados e SEM o endereço.
 * Retorno: o adotante + possui_endereco (true/false), para o painel saber se existe um endereço.
 * Detalhe: "{ endereco, ...rest }" separa o endereço do resto do objeto.
 */
// Por padrão, contatos saem mascarados e o endereço é omitido (LGPD).
function toMasked(adopter) {
  const { endereco, ...rest } = adopter;
  return {
    ...rest,
    email: maskEmail(adopter.email),
    telefone: maskPhone(adopter.telefone),
    // Usa o valor calculado pelo SQL (listas) ou, se não houver, verifica o endereço (detalhes).
    possui_endereco: adopter.possui_endereco ?? Boolean(endereco),
  };
}

/*
 * FUNÇÃO: createAdopterService (fábrica)
 * Parâmetros: repository (padrão adopterRepository) e { audit, transaction }.
 * Retorno: { list, getById, reveal, update, listForExport, exportTitularData, anonymize, remove }.
 */
function createAdopterService(repository = adopterRepository, {
  audit = auditService,
  transaction = withTransaction,
} = {}) {
  /*
   * list: página de adotantes, mascarados.
   */
  async function list(query = {}) {
    const { items, total } = await repository.list({ ...parsePagination(query), ...buildFilters(query) });
    return { items: items.map(toMasked), total };
  }

  /*
   * getById: detalhes + histórico, com dados mascarados (inclusive dentro das observações dos pedidos).
   */
  async function getById(id) {
    // "undefined" = usar o pool padrão.
    const adopter = await repository.findById(undefined, id);
    if (!adopter) throw notFound();

    const history = await repository.findHistory(undefined, id);
    return {
      ...toMasked(adopter),
      historico: {
        // Mascara e-mails/telefones escritos nas observações.
        pedidos: history.pedidos.map(({ observacoes, ...request }) => ({
          ...request,
          observacoes: maskContactsInText(observacoes),
        })),
        // "doador_email: email" renomeia o campo para a variável "email".
        doacoes: history.doacoes.map(({ doador_email: email, ...donation }) => ({ ...donation, doador_email: maskEmail(email) })),
        historias: history.historias,
      },
    };
  }

  /*
   * reveal: devolve os contatos completos e registra quem viu (auditoria).
   */
  async function reveal(id, actor = {}) {
    const adopter = await repository.findById(undefined, id);
    if (!adopter) throw notFound();

    await audit.record({ actor, action: 'revelar_contato', module: 'adopters', entity: 'adotante', entityId: id });
    return { id, email: adopter.email, telefone: adopter.telefone, endereco: adopter.endereco };
  }

  /*
   * update: edita o adotante.
   * Retorno: o adotante atualizado (mascarado). Erro 409 se o e-mail já estiver em uso.
   */
  async function update(id, payload, actor = {}) {
    const current = await repository.findById(undefined, id);
    if (!current) throw notFound();

    // Só campos editáveis; textos sem espaços nas pontas e texto vazio vira null.
    const changes = Object.fromEntries(
      Object.entries(payload)
        .filter(([field]) => EDITABLE_FIELDS.includes(field))
        .map(([field, value]) => [field, typeof value === 'string' ? value.trim() || null : value])
    );
    // E-mail sempre em minúsculas.
    if (changes.email) changes.email = changes.email.toLowerCase();

    let adopter;
    try {
      adopter = await repository.update(id, changes);
    } catch (error) {
      // 23505 = violação de restrição UNIQUE (e-mail repetido).
      if (error.code === '23505') {
        throw new AppError(409, 'EMAIL_EM_USO', 'Já existe um adotante com este e-mail.', [{ field: 'email', message: 'Use outro e-mail.' }]);
      }
      throw error;
    }

    // Auditoria só dos campos que realmente mudaram.
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

  /*
   * listForExport: linhas do CSV (com contatos completos só se revealContacts for true), auditando a exportação.
   */
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

  /*
   * exportTitularData: todos os dados do titular num objeto só (sem mascarar).
   */
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

  /*
   * assertCanErase (interna): confere, dentro da transação, se é possível anonimizar/excluir.
   * - trava a linha (forUpdate) para ninguém mudar o adotante no meio;
   * - 404 se não existir; 409 se já anonimizado; 409 se houver pedidos em andamento.
   */
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

  /*
   * anonymize: anonimiza o titular numa transação (verificação + anonimização + auditoria juntas).
   */
  // Anonimização irreversível: mantém pedidos, doações e estatísticas, sem identificar o titular.
  // A auditoria não guarda os valores antigos, para não recriar os dados apagados.
  async function anonymize(id, actor = {}) {
    return transaction(async (db) => {
      await assertCanErase(db, id);
      await repository.anonymize(db, id);
      // O 2º argumento (db) grava a auditoria na mesma transação.
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

  /*
   * remove: exclui o titular numa transação (mesmas verificações da anonimização).
   */
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

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createAdopterService(), createAdopterService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Leituras devolvem dados mascarados (toMasked, maskContactsInText). Revelar e
 *   exportar gravam auditoria. Editar normaliza, trata e-mail repetido (409) e
 *   audita o diff. Anonimizar/excluir rodam numa transação: travam o registro,
 *   conferem as condições, apagam os dados e gravam a auditoria juntos.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - LGPD na prática: mascaramento, minimização, auditoria e direitos do titular.
 *   - Transações com verificação + ação + auditoria (tudo ou nada).
 *   - Códigos de erro do PostgreSQL (23505 = valor único repetido).
 *   - Desestruturação com renomeação e com "resto".
 * ============================================================================
 */
