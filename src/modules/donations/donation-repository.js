/*
 * ============================================================================
 * ARQUIVO: donation-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY das DOAÇÕES (tabela "doacoes"): listar com filtros, exportar,
 *   buscar, criar, atualizar, resumo (por status, forma de pagamento e tipo),
 *   série mensal e KPIs (das views do banco).
 *
 * PRINCIPAIS ITENS:
 *   - SORT_COLUMNS, SELECT_DONATION (SQL base), UPDATABLE_COLUMNS.
 *   - buildWhere (interna).
 *   - list, listForExport, findById, create, update, summary, monthly, kpis (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool e db/sql.
 *   - Tabelas/views: doacoes, adotantes, vw_doacoes_por_mes, vw_kpis_gerais.
 *   - Usado por: ./donation-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL.
const { buildUpdate, createWhere } = require('../../db/sql');

// Ordenações permitidas ("d." = apelido de doacoes).
const SORT_COLUMNS = Object.freeze({
  data: 'd.data',
  valor: 'd.valor',
  doador_nome: 'd.doador_nome',
  status: 'd.status',
});

// SQL base: doação + nome do adotante vinculado (opcional → LEFT JOIN) + campos do gateway (Mercado Pago).
const SELECT_DONATION = `
  SELECT d.id, d.adotante_id, a.nome AS adotante_nome, d.doador_nome, d.doador_email,
         d.tipo, d.valor, d.metodo, d.status, d.data, d.gateway, d.gateway_status, d.assinatura_id
  FROM doacoes d
  LEFT JOIN adotantes a ON a.id = d.adotante_id`;

// Colunas editáveis manualmente.
const UPDATABLE_COLUMNS = new Set(['adotante_id', 'doador_nome', 'doador_email', 'tipo', 'valor', 'metodo', 'status', 'data']);

/*
 * FUNÇÃO: buildWhere (interna)
 * O que faz: filtros: busca (nome ou e-mail do doador), tipo, método, status, adotante e período.
 */
function buildWhere(filters) {
  const where = createWhere();

  if (filters.q) where.add("(d.doador_nome ILIKE ? OR COALESCE(d.doador_email, '') ILIKE ?)", `%${filters.q}%`);
  if (filters.tipo) where.add('d.tipo = ?', filters.tipo);
  if (filters.metodo) where.add('d.metodo = ?', filters.metodo);
  if (filters.status) where.add('d.status = ?', filters.status);
  if (filters.adotanteId) where.add('d.adotante_id = ?', filters.adotanteId);
  if (filters.de) where.add('d.data >= ?::date', filters.de);
  // "< ate + 1 dia" inclui o dia final inteiro.
  if (filters.ate) where.add("d.data < ?::date + interval '1 day'", filters.ate);

  return { clause: where.clause(), values: where.values };
}

/*
 * FUNÇÃO: list (async) — total + página de doações.
 */
async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.data;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM doacoes d ${clause}`, values);
  const result = await pool.query(
    `${SELECT_DONATION}
     ${clause}
     ORDER BY ${sortColumn} ${sortOrder}, d.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

/*
 * FUNÇÃO: listForExport (async) — linhas do CSV (mais recentes primeiro), até maxRows + 1.
 */
async function listForExport(filters, maxRows) {
  const { clause, values } = buildWhere(filters);
  const result = await pool.query(
    `${SELECT_DONATION} ${clause} ORDER BY d.data DESC, d.id ASC LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

/*
 * FUNÇÃO: findById (async) — uma doação ou null.
 */
async function findById(id) {
  const result = await pool.query(`${SELECT_DONATION} WHERE d.id = $1`, [id]);
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: create (async)
 * O que faz: insere a doação e devolve a versão completa (com nome do adotante).
 * Detalhe: COALESCE($8::timestamptz, now()) usa a data informada ou, se for null, o momento atual.
 */
async function create(donation) {
  const result = await pool.query(
    `INSERT INTO doacoes (adotante_id, doador_nome, doador_email, tipo, valor, metodo, status, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
     RETURNING id`,
    [
      donation.adotante_id,
      donation.doador_nome,
      donation.doador_email,
      donation.tipo,
      donation.valor,
      donation.metodo,
      donation.status,
      donation.data,
    ]
  );
  return findById(result.rows[0].id);
}

/*
 * FUNÇÃO: update (async)
 * O que faz: atualização parcial; devolve a doação atualizada (ou null se não existir).
 */
async function update(id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return findById(id);

  const result = await pool.query(
    `UPDATE doacoes SET ${update.set} WHERE id = ${update.idParam} RETURNING id`,
    update.values
  );
  return result.rowCount > 0 ? findById(id) : null;
}

/*
 * FUNÇÃO: summary (async)
 * O que faz: três agrupamentos em paralelo:
 *   - por status (todas as doações do filtro);
 *   - por forma de pagamento e por tipo (só as CONFIRMADAS).
 * Detalhe: "confirmed" acrescenta a condição de status ao WHERE existente (com AND) ou cria um WHERE.
 *   COALESCE(SUM(...), 0) devolve 0 quando não há linhas (SUM de nada é NULL).
 */
async function summary(filters) {
  const { clause, values } = buildWhere(filters);
  const confirmed = clause ? `${clause} AND d.status = 'confirmada'` : "WHERE d.status = 'confirmada'";

  const [byStatus, byMethod, byType] = await Promise.all([
    pool.query(
      `SELECT d.status AS chave, COUNT(*)::int AS quantidade, COALESCE(SUM(d.valor), 0) AS total
       FROM doacoes d ${clause} GROUP BY d.status ORDER BY d.status`,
      values
    ),
    pool.query(
      `SELECT COALESCE(d.metodo, 'nao_informado') AS chave, COUNT(*)::int AS quantidade, COALESCE(SUM(d.valor), 0) AS total
       FROM doacoes d ${confirmed} GROUP BY 1 ORDER BY 1`,
      values
    ),
    pool.query(
      `SELECT d.tipo AS chave, COUNT(*)::int AS quantidade, COALESCE(SUM(d.valor), 0) AS total
       FROM doacoes d ${confirmed} GROUP BY d.tipo ORDER BY d.tipo`,
      values
    ),
  ]);

  return { byStatus: byStatus.rows, byMethod: byMethod.rows, byType: byType.rows };
}

/*
 * FUNÇÃO: monthly (async) — série mensal dos últimos "months" meses (view vw_doacoes_por_mes).
 */
// Série mensal e KPIs vêm das views do banco (somam somente doações confirmadas).
async function monthly(months) {
  const result = await pool.query(
    `SELECT mes, total, quantidade
     FROM vw_doacoes_por_mes
     WHERE mes >= date_trunc('month', now()) - make_interval(months => $1 - 1)
     ORDER BY mes`,
    [months]
  );
  return result.rows;
}

/*
 * FUNÇÃO: kpis (async) — indicadores gerais (inclui o arrecadado no mês atual).
 */
async function kpis() {
  const result = await pool.query('SELECT * FROM vw_kpis_gerais');
  return result.rows[0];
}

// Exporta as funções.
module.exports = { list, listForExport, findById, create, update, summary, monthly, kpis };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O donation-service chama list/listForExport/findById para leituras,
 *   create/update para gravações e summary/monthly/kpis para os relatórios.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Agregações condicionais e COALESCE(SUM(...), 0).
 *   - Reaproveitar o mesmo WHERE em várias consultas (com AND extra).
 *   - Valores padrão no INSERT com COALESCE(..., now()).
 * ============================================================================
 */
