const pool = require('../../db/db');

const SORT_COLUMNS = Object.freeze({
  data: 'd.data',
  valor: 'd.valor',
  doador_nome: 'd.doador_nome',
  status: 'd.status',
});

const SELECT_DONATION = `
  SELECT d.id, d.adotante_id, a.nome AS adotante_nome, d.doador_nome, d.doador_email,
         d.tipo, d.valor, d.metodo, d.status, d.data
  FROM doacoes d
  LEFT JOIN adotantes a ON a.id = d.adotante_id`;

function buildWhere(filters) {
  const conditions = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replaceAll('?', `$${values.length}`));
  }

  if (filters.q) addCondition("(d.doador_nome ILIKE ? OR COALESCE(d.doador_email, '') ILIKE ?)", `%${filters.q}%`);
  if (filters.tipo) addCondition('d.tipo = ?', filters.tipo);
  if (filters.metodo) addCondition('d.metodo = ?', filters.metodo);
  if (filters.status) addCondition('d.status = ?', filters.status);
  if (filters.adotanteId) addCondition('d.adotante_id = ?', filters.adotanteId);
  if (filters.de) addCondition('d.data >= ?::date', filters.de);
  if (filters.ate) addCondition("d.data < ?::date + interval '1 day'", filters.ate);

  return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

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

async function listForExport(filters, maxRows) {
  const { clause, values } = buildWhere(filters);
  const result = await pool.query(
    `${SELECT_DONATION} ${clause} ORDER BY d.data DESC, d.id ASC LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

async function findById(id) {
  const result = await pool.query(`${SELECT_DONATION} WHERE d.id = $1`, [id]);
  return result.rows[0] || null;
}

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

async function update(id, changes) {
  const allowedColumns = new Set(['adotante_id', 'doador_nome', 'doador_email', 'tipo', 'valor', 'metodo', 'status', 'data']);
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  if (entries.length === 0) return findById(id);

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await pool.query(
    `UPDATE doacoes SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING id`,
    values
  );
  return result.rowCount > 0 ? findById(id) : null;
}

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

async function kpis() {
  const result = await pool.query('SELECT * FROM vw_kpis_gerais');
  return result.rows[0];
}

module.exports = { list, listForExport, findById, create, update, summary, monthly, kpis };
