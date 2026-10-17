/*
 * ============================================================================
 * ARQUIVO: adoption-triage-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY da TRIAGEM DE PEDIDOS DE ADOÇÃO no painel. Lista e busca pedidos
 *   já com os dados do animal, do adotante e do responsável (JOINs), atualiza o
 *   pedido e oferece as operações usadas na DECISÃO: travar o animal, mudar
 *   status do animal e do adotante, travar os outros pedidos do mesmo animal e
 *   contar pedidos abertos do adotante.
 *
 * PRINCIPAIS ITENS:
 *   - SELECT_REQUEST (SQL base), SORT_EXPRESSIONS, UPDATABLE_COLUMNS.
 *   - buildWhere(filters) (interna).
 *   - list, findById, update, lockAnimal, setAnimalStatus, setAdopterStatus,
 *     lockOpenRequestsForAnimal, countOpenRequestsForAdopter, findActiveUser.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool, db/sql, config/domain-values.
 *   - Tabelas: pedidos_adocao, animais, adotantes, usuarios.
 *   - Usado por: ./adoption-triage-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL.
const { buildUpdate, createWhere } = require('../../db/sql');
// Status em aberto.
const { adoptionRequest } = require('../../config/domain-values');

// SQL base: pedido (p) + animal (a) + adotante (d) + responsável (u, opcional → LEFT JOIN).
// "AS animal_nome" etc. dão nomes únicos às colunas de tabelas diferentes.
const SELECT_REQUEST = `
  SELECT p.id, p.status, p.prioridade, p.observacoes, p.termo_assinado, p.termo_assinado_em, p.visita_preferida_em,
         p.data_pedido, p.atualizado_em,
         a.id AS animal_id, a.nome AS animal_nome, a.especie AS animal_especie,
         a.status AS animal_status, a.foto_url AS animal_foto_url,
         d.id AS adotante_id, d.nome AS adotante_nome, d.email AS adotante_email,
         d.telefone AS adotante_telefone, d.cidade AS adotante_cidade, d.estado AS adotante_estado,
         d.status AS adotante_status,
         u.id AS responsavel_id, u.nome AS responsavel_nome
  FROM pedidos_adocao p
  JOIN animais a ON a.id = p.animal_id
  JOIN adotantes d ON d.id = p.adotante_id
  LEFT JOIN usuarios u ON u.id = p.responsavel_id`;

// Ordenações permitidas. A prioridade usa CASE para ordenar alto(1) → médio(2) → baixo(3),
// em vez da ordem alfabética.
const SORT_EXPRESSIONS = Object.freeze({
  data_pedido: 'p.data_pedido',
  atualizado_em: 'p.atualizado_em',
  status: 'p.status',
  prioridade: "CASE p.prioridade WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END",
});

// Colunas do pedido que podem ser alteradas.
const UPDATABLE_COLUMNS = new Set([
  'status', 'prioridade', 'responsavel_id', 'observacoes', 'termo_assinado', 'termo_assinado_em',
]);

/*
 * FUNÇÃO: buildWhere (interna)
 * O que faz: filtros da lista: status (vários), prioridade, responsável (ou sem responsável),
 *   animal, adotante, busca por nome (adotante ou animal) e período (de/até).
 * Detalhe das datas: "ate" usa "< data + 1 dia" para incluir o dia inteiro.
 */
function buildWhere(filters) {
  const where = createWhere();

  if (filters.status?.length) where.add('p.status = ANY(?::varchar[])', filters.status);
  if (filters.prioridade) where.add('p.prioridade = ?', filters.prioridade);
  if (filters.responsavelId) where.add('p.responsavel_id = ?', filters.responsavelId);
  if (filters.semResponsavel) where.addRaw('p.responsavel_id IS NULL');
  if (filters.animalId) where.add('p.animal_id = ?', filters.animalId);
  if (filters.adotanteId) where.add('p.adotante_id = ?', filters.adotanteId);
  if (filters.q) where.add('(d.nome ILIKE ? OR a.nome ILIKE ?)', `%${filters.q}%`);
  if (filters.de) where.add('p.data_pedido >= ?::date', filters.de);
  if (filters.ate) where.add("p.data_pedido < ?::date + interval '1 day'", filters.ate);

  return { clause: where.clause(), values: where.values };
}

/*
 * FUNÇÃO: list (async)
 * O que faz: total + página de pedidos.
 * Detalhe: a contagem precisa dos JOINs com animais/adotantes porque a busca "q" usa os nomes deles.
 */
async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortExpression = SORT_EXPRESSIONS[filters.sort] || SORT_EXPRESSIONS.data_pedido;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM pedidos_adocao p
     JOIN animais a ON a.id = p.animal_id
     JOIN adotantes d ON d.id = p.adotante_id
     ${clause}`,
    values
  );
  // Desempates: data do pedido (mais recente) e id.
  const result = await pool.query(
    `${SELECT_REQUEST}
     ${clause}
     ORDER BY ${sortExpression} ${sortOrder}, p.data_pedido DESC, p.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

/*
 * FUNÇÃO: findById (async)
 * O que faz: busca um pedido completo; com forUpdate, trava só a linha do pedido (FOR UPDATE OF p).
 */
async function findById(db = pool, id, { forUpdate = false } = {}) {
  const result = await db.query(
    `${SELECT_REQUEST} WHERE p.id = $1 ${forUpdate ? 'FOR UPDATE OF p' : ''}`,
    [id]
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: update (async)
 * O que faz: atualiza as colunas permitidas do pedido (não devolve nada).
 */
async function update(db, id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return;

  await db.query(`UPDATE pedidos_adocao SET ${update.set} WHERE id = ${update.idParam}`, update.values);
}

/*
 * FUNÇÃO: lockAnimal (async)
 * O que faz: busca e TRAVA o animal (FOR UPDATE) — ninguém mais altera o animal até o fim da transação.
 */
async function lockAnimal(db, animalId) {
  const result = await db.query('SELECT id, nome, status FROM animais WHERE id = $1 FOR UPDATE', [animalId]);
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: setAnimalStatus (async)
 * O que faz: muda o status do animal (ex.: para "adotado" na aprovação).
 */
async function setAnimalStatus(db, animalId, status) {
  await db.query('UPDATE animais SET status = $1 WHERE id = $2', [status, animalId]);
}

/*
 * FUNÇÃO: setAdopterStatus (async)
 * O que faz: muda o status do adotante (ex.: para "adotante").
 */
async function setAdopterStatus(db, adopterId, status) {
  await db.query('UPDATE adotantes SET status = $1 WHERE id = $2', [status, adopterId]);
}

/*
 * FUNÇÃO: lockOpenRequestsForAnimal (async)
 * O que faz: busca e trava os OUTROS pedidos em aberto do mesmo animal (para encerrá-los na aprovação).
 * Parâmetros: animalId e excludeId (o pedido que está sendo aprovado).
 */
async function lockOpenRequestsForAnimal(db, animalId, excludeId) {
  const result = await db.query(
    `SELECT id, adotante_id, status, observacoes
     FROM pedidos_adocao
     WHERE animal_id = $1 AND id <> $2 AND status = ANY($3::varchar[])
     FOR UPDATE`,
    [animalId, excludeId, adoptionRequest.openStatus]
  );
  return result.rows;
}

/*
 * FUNÇÃO: countOpenRequestsForAdopter (async)
 * O que faz: conta os outros pedidos em aberto do adotante (para decidir o status dele).
 */
async function countOpenRequestsForAdopter(db, adopterId, excludeId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM pedidos_adocao
     WHERE adotante_id = $1 AND id <> $2 AND status = ANY($3::varchar[])`,
    [adopterId, excludeId, adoptionRequest.openStatus]
  );
  return result.rows[0].total;
}

/*
 * FUNÇÃO: findActiveUser (async)
 * O que faz: busca um membro ATIVO da equipe (para validar o responsável indicado).
 */
async function findActiveUser(db, id) {
  const result = await db.query('SELECT id, nome, cargo FROM usuarios WHERE id = $1 AND ativo = true', [id]);
  return result.rows[0] || null;
}

// Exporta as funções.
module.exports = {
  list,
  findById,
  update,
  lockAnimal,
  setAnimalStatus,
  setAdopterStatus,
  lockOpenRequestsForAnimal,
  countOpenRequestsForAdopter,
  findActiveUser,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Lista/detalhe: SELECT_REQUEST + filtros + ordenação (inclusive por prioridade).
 *   - Decisão (no service, em transação): trava o pedido, o animal e os outros pedidos
 *     do animal; muda status de animal, adotante e pedidos de forma consistente.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - JOINs com várias tabelas e apelidos de colunas.
 *   - CASE ... WHEN no ORDER BY (ordem personalizada).
 *   - Travas FOR UPDATE / FOR UPDATE OF em operações concorrentes.
 *   - Filtros por período com ::date e interval.
 * ============================================================================
 */
