/*
 * ============================================================================
 * ARQUIVO: volunteer-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY dos VOLUNTÁRIOS. Usa duas tabelas:
 *     - voluntarios: dados da pessoa;
 *     - voluntario_areas: as áreas em que ela ajuda (uma linha por área) —
 *       relação "um para muitos".
 *   As consultas juntam as áreas numa lista (array) dentro de cada voluntário.
 *
 * PRINCIPAIS ITENS:
 *   - SORT_COLUMNS, SELECT_VOLUNTEER (SQL base), UPDATABLE_COLUMNS, buildWhere (interna).
 *   - list, findById, findIdByEmail, create, update, replaceAreas, remove (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool e db/sql.
 *   - Usado por: ./volunteer-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL.
const { buildUpdate, createWhere } = require('../../db/sql');

// Ordenações permitidas ("v." = apelido de voluntarios).
const SORT_COLUMNS = Object.freeze({
  nome: 'v.nome',
  criado_em: 'v.criado_em',
  data_inicio: 'v.data_inicio',
  status: 'v.status',
});

// SQL base: voluntário + suas áreas reunidas num array.
// - array_agg(va.area ORDER BY va.area): junta as áreas (em ordem alfabética) num array.
// - FILTER (WHERE va.area IS NOT NULL): ignora a linha "vazia" do LEFT JOIN quando não há áreas.
// - COALESCE(..., '{}'): sem áreas, devolve array vazio em vez de NULL.
// (Quem usa este SQL precisa terminar com GROUP BY v.id.)
const SELECT_VOLUNTEER = `
  SELECT v.id, v.nome, v.email, v.telefone, v.status, v.data_inicio, v.criado_em,
         COALESCE(array_agg(va.area ORDER BY va.area) FILTER (WHERE va.area IS NOT NULL), '{}') AS areas
  FROM voluntarios v
  LEFT JOIN voluntario_areas va ON va.voluntario_id = v.id`;

// Colunas editáveis (as áreas têm função própria).
const UPDATABLE_COLUMNS = new Set(['nome', 'email', 'telefone', 'status', 'data_inicio']);

/*
 * buildWhere (interna): busca (nome/e-mail), status e área.
 * O filtro de área usa EXISTS (subconsulta "existe alguma linha?"), para não atrapalhar o array_agg
 * (que precisa continuar vendo TODAS as áreas do voluntário).
 */
function buildWhere(filters) {
  const where = createWhere();

  if (filters.q) where.add('(v.nome ILIKE ? OR v.email ILIKE ?)', `%${filters.q}%`);
  if (filters.status) where.add('v.status = ?', filters.status);
  if (filters.area) {
    where.add('EXISTS (SELECT 1 FROM voluntario_areas x WHERE x.voluntario_id = v.id AND x.area = ?)', filters.area);
  }

  return { clause: where.clause(), values: where.values };
}

/*
 * list (async): total + página (ordenação padrão por nome, A→Z).
 */
async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.nome;
  const sortOrder = filters.order === 'desc' ? 'DESC' : 'ASC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM voluntarios v ${clause}`, values);
  const result = await pool.query(
    `${SELECT_VOLUNTEER}
     ${clause}
     GROUP BY v.id
     ORDER BY ${sortColumn} ${sortOrder}, v.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

/*
 * findById (async): um voluntário com suas áreas (db opcional para transações).
 */
async function findById(db = pool, id) {
  const result = await db.query(`${SELECT_VOLUNTEER} WHERE v.id = $1 GROUP BY v.id`, [id]);
  return result.rows[0] || null;
}

/*
 * findIdByEmail (async): id do voluntário com o e-mail, ou null.
 */
async function findIdByEmail(db, email) {
  const result = await db.query('SELECT id FROM voluntarios WHERE LOWER(email) = $1 LIMIT 1', [email]);
  return result.rows[0]?.id || null;
}

/*
 * create (async): insere o voluntário (data de início padrão: hoje — CURRENT_DATE) e devolve o id.
 */
async function create(db, volunteer) {
  const result = await db.query(
    `INSERT INTO voluntarios (nome, email, telefone, status, data_inicio)
     VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))
     RETURNING id`,
    [volunteer.nome, volunteer.email, volunteer.telefone, volunteer.status, volunteer.data_inicio]
  );
  return result.rows[0].id;
}

/*
 * update (async): atualização parcial. Retorno: true se alterou (ou se não havia nada a alterar).
 */
async function update(db, id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return true;

  const result = await db.query(`UPDATE voluntarios SET ${update.set} WHERE id = ${update.idParam}`, update.values);
  return result.rowCount > 0;
}

/*
 * replaceAreas (async): troca todas as áreas do voluntário: apaga as atuais e insere as novas.
 * unnest($2::varchar[]) "desenrola" o array em linhas: um INSERT só para várias áreas.
 */
async function replaceAreas(db, id, areas) {
  await db.query('DELETE FROM voluntario_areas WHERE voluntario_id = $1', [id]);
  if (areas.length > 0) {
    await db.query(
      'INSERT INTO voluntario_areas (voluntario_id, area) SELECT $1, unnest($2::varchar[])',
      [id, areas]
    );
  }
}

/*
 * remove (async): exclui o voluntário; true se apagou.
 */
async function remove(id) {
  const result = await pool.query('DELETE FROM voluntarios WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// Exporta as funções.
module.exports = { list, findById, findIdByEmail, create, update, replaceAreas, remove };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Leituras usam SELECT_VOLUNTEER + GROUP BY para devolver cada voluntário com
 *   o array de áreas. Gravações separam os dados (create/update) das áreas
 *   (replaceAreas), dentro de transações do service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Relação um-para-muitos e tabela auxiliar.
 *   - array_agg, FILTER, unnest e arrays no PostgreSQL.
 *   - EXISTS (subconsulta de existência).
 *   - Estratégia "apagar e inserir de novo" para listas pequenas.
 * ============================================================================
 */
