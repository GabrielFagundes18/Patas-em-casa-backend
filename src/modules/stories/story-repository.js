/*
 * ============================================================================
 * ARQUIVO: story-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY das HISTÓRIAS DE ADOÇÃO (tabela "historias"): lista e busca do
 *   painel (com nomes do animal e do adotante vinculados), criar, editar,
 *   excluir e a lista pública do site (só publicadas, sem dados do adotante).
 *
 * PRINCIPAIS ITENS:
 *   - SELECT_STORY (SQL base), UPDATABLE_COLUMNS, buildWhere (interna).
 *   - list, findById, create, update, remove, listPublished (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool e db/sql. Tabelas: historias, animais, adotantes.
 *   - Usado por: ./story-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL.
const { buildUpdate, createWhere } = require('../../db/sql');

// SQL base: história (h) + nome do animal (a) e do adotante (d), ambos opcionais (LEFT JOIN).
const SELECT_STORY = `
  SELECT h.id, h.autor_nome, h.texto, h.foto_url, h.publicado, h.criado_em,
         h.animal_id, a.nome AS animal_nome, h.adotante_id, d.nome AS adotante_nome
  FROM historias h
  LEFT JOIN animais a ON a.id = h.animal_id
  LEFT JOIN adotantes d ON d.id = h.adotante_id`;

// Colunas editáveis.
const UPDATABLE_COLUMNS = new Set(['autor_nome', 'texto', 'foto_url', 'publicado', 'animal_id', 'adotante_id']);

/*
 * buildWhere (interna): busca (autor ou texto), publicada ou não, e animal.
 */
function buildWhere(filters) {
  const where = createWhere();

  if (filters.q) where.add('(h.autor_nome ILIKE ? OR h.texto ILIKE ?)', `%${filters.q}%`);
  if (filters.publicado !== undefined) where.add('h.publicado = ?', filters.publicado);
  if (filters.animalId) where.add('h.animal_id = ?', filters.animalId);

  return { clause: where.clause(), values: where.values };
}

/*
 * list (async): total + página, ordenada pela data de criação.
 */
async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM historias h ${clause}`, values);
  const result = await pool.query(
    `${SELECT_STORY}
     ${clause}
     ORDER BY h.criado_em ${sortOrder}, h.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

/*
 * findById (async): uma história ou null.
 */
async function findById(id) {
  const result = await pool.query(`${SELECT_STORY} WHERE h.id = $1`, [id]);
  return result.rows[0] || null;
}

/*
 * create (async): insere e devolve a história completa.
 */
async function create(story) {
  const result = await pool.query(
    `INSERT INTO historias (autor_nome, texto, foto_url, publicado, animal_id, adotante_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [story.autor_nome, story.texto, story.foto_url, story.publicado, story.animal_id, story.adotante_id]
  );
  return findById(result.rows[0].id);
}

/*
 * update (async): atualização parcial; devolve a história ou null (se não existir).
 */
async function update(id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return findById(id);

  const result = await pool.query(`UPDATE historias SET ${update.set} WHERE id = ${update.idParam}`, update.values);
  return result.rowCount > 0 ? findById(id) : null;
}

/*
 * remove (async): exclui; true se apagou.
 */
async function remove(id) {
  const result = await pool.query('DELETE FROM historias WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

/*
 * listPublished (async): histórias publicadas para o site, com dados básicos do animal.
 * Repare que NÃO há JOIN com adotantes: o site não recebe dados do adotante.
 */
// Site público: só histórias publicadas e nenhum dado do adotante vinculado.
async function listPublished(filters) {
  const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM historias WHERE publicado = true');
  const result = await pool.query(
    `SELECT h.id, h.autor_nome, h.texto, h.foto_url, h.criado_em,
            a.id AS animal_id, a.nome AS animal_nome, a.especie AS animal_especie, a.foto_url AS animal_foto_url
     FROM historias h
     LEFT JOIN animais a ON a.id = h.animal_id
     WHERE h.publicado = true
     ORDER BY h.criado_em DESC, h.id ASC
     LIMIT $1 OFFSET $2`,
    [filters.pageSize, filters.offset]
  );
  return { items: result.rows, total: countResult.rows[0].total };
}

// Exporta as funções.
module.exports = { list, findById, create, update, remove, listPublished };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Painel: list/findById/create/update/remove com SELECT_STORY. Site:
 *   listPublished, com um SELECT próprio que só traz dados públicos.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - LEFT JOIN para vínculos opcionais.
 *   - Consultas diferentes para públicos diferentes (painel x site).
 * ============================================================================
 */
