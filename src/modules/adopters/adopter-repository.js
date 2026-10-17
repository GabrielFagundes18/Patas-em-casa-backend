/*
 * ============================================================================
 * ARQUIVO: adopter-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY dos ADOTANTES (tabela "adotantes"): listagem com contagem de
 *   pedidos, exportação, busca, histórico (pedidos, doações, histórias),
 *   edição e as operações da LGPD (anonimizar e excluir, limpando também os
 *   dados pessoais nos registros ligados ao titular).
 *
 * PRINCIPAIS ITENS:
 *   - SORT_COLUMNS, ANONYMIZED_NAME (exportado), REMOVED_TEXT, UPDATABLE_COLUMNS.
 *   - buildWhere(filters) (interna), SELECT_WITH_COUNTS (SQL base).
 *   - list, listForExport, findById, findHistory, update, countOpenRequests,
 *     anonymize, remove (exportadas); scrubLinkedRecords (interna).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool, db/sql, config/domain-values.
 *   - Tabelas: adotantes, pedidos_adocao, animais, doacoes, historias.
 *   - Usado por: ./adopter-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL.
const { buildUpdate, createWhere } = require('../../db/sql');
// Status "em aberto" dos pedidos.
const { adoptionRequest } = require('../../config/domain-values');

// Ordenação permitida ("d." = apelido da tabela adotantes nas consultas).
const SORT_COLUMNS = Object.freeze({
  nome: 'd.nome',
  criado_em: 'd.criado_em',
  cidade: 'd.cidade',
  status: 'd.status',
});

// Nome colocado no lugar do nome real ao anonimizar.
const ANONYMIZED_NAME = 'Titular anonimizado';
// Texto colocado no lugar das observações dos pedidos.
const REMOVED_TEXT = '[conteúdo removido a pedido do titular (LGPD)]';

// Colunas que podem ser editadas.
const UPDATABLE_COLUMNS = new Set(['nome', 'email', 'telefone', 'cidade', 'estado', 'endereco', 'status']);

/*
 * FUNÇÃO: buildWhere (interna)
 * O que faz: monta o WHERE dos filtros: busca (nome, e-mail ou telefone), status, cidade e estado.
 * Retorno: { clause, values }.
 */
function buildWhere(filters) {
  const where = createWhere();

  if (filters.q) {
    // Só os dígitos da busca (para procurar telefones digitados com ou sem pontuação).
    const digits = filters.q.replace(/\D/g, '');
    // Marcador do texto da busca (usado duas vezes: nome e e-mail).
    const text = where.param(`%${filters.q}%`);
    // Com 4 ou mais dígitos, também procura no telefone. regexp_replace(..., '\D', '', 'g') remove
    // do telefone tudo que não é dígito. ("\\D" no JavaScript vira "\D" no SQL.)
    const phoneCondition = digits.length >= 4
      ? ` OR regexp_replace(COALESCE(d.telefone, ''), '\\D', '', 'g') LIKE ${where.param(`%${digits}%`)}`
      : '';
    // addRaw porque os marcadores já foram criados acima com where.param.
    where.addRaw(`(d.nome ILIKE ${text} OR d.email ILIKE ${text}${phoneCondition})`);
  }
  if (filters.status) where.add('d.status = ?', filters.status);
  // Cidade com ILIKE sem "%": igualdade sem diferenciar maiúsculas.
  if (filters.cidade) where.add('d.cidade ILIKE ?', filters.cidade);
  if (filters.estado) where.add('d.estado = ?', filters.estado);

  return { clause: where.clause(), values: where.values };
}

// SQL base: dados do adotante + total de pedidos + pedidos em aberto.
// - LEFT JOIN: inclui adotantes mesmo sem nenhum pedido.
// - COUNT(p.id) FILTER (WHERE ...): conta só os pedidos que atendem à condição.
// - '{novo,em_analise,...}'::varchar[]: lista de status abertos escrita como array do PostgreSQL
//   (os valores vêm de domain-values, uma lista fixa do código — não do usuário).
// - (d.endereco IS NOT NULL) AS possui_endereco: informa se há endereço sem mostrá-lo.
const SELECT_WITH_COUNTS = `
  SELECT d.id, d.nome, d.email, d.telefone, d.cidade, d.estado, d.status, d.criado_em,
         (d.endereco IS NOT NULL) AS possui_endereco,
         COUNT(p.id)::int AS total_pedidos,
         COUNT(p.id) FILTER (WHERE p.status = ANY('{${adoptionRequest.openStatus.join(',')}}'::varchar[]))::int AS pedidos_abertos
  FROM adotantes d
  LEFT JOIN pedidos_adocao p ON p.adotante_id = d.id`;

/*
 * FUNÇÃO: list (async)
 * O que faz: página de adotantes com contagens, mais o total geral.
 * Retorno: { items, total }.
 * Detalhe: GROUP BY d.id agrupa as linhas do JOIN para contar os pedidos de cada adotante.
 */
async function list(filters) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.criado_em;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM adotantes d ${clause}`, values);
  const result = await pool.query(
    `${SELECT_WITH_COUNTS}
     ${clause}
     GROUP BY d.id
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, d.id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

/*
 * FUNÇÃO: listForExport (async)
 * O que faz: linhas para o CSV, em ordem alfabética, até maxRows + 1 (para detectar o excesso).
 */
async function listForExport(filters, maxRows) {
  const { clause, values } = buildWhere(filters);
  const result = await pool.query(
    `${SELECT_WITH_COUNTS}
     ${clause}
     GROUP BY d.id
     ORDER BY d.nome ASC, d.id ASC
     LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

/*
 * FUNÇÃO: findById (async)
 * O que faz: busca um adotante (com endereço).
 * Parâmetros: db (padrão pool), id, { forUpdate } — se true, trava a linha na transação (FOR UPDATE).
 * Retorno: a linha ou null.
 */
async function findById(db = pool, id, { forUpdate = false } = {}) {
  const result = await db.query(
    `SELECT id, nome, email, telefone, cidade, estado, endereco, status, criado_em
     FROM adotantes WHERE id = $1 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id]
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: findHistory (async)
 * O que faz: busca, em paralelo (Promise.all), os pedidos, as doações e as histórias do adotante.
 * Retorno: { pedidos, doacoes, historias } (arrays).
 * Detalhe: a desestruturação [requests, donations, stories] pega os 3 resultados na mesma ordem.
 */
async function findHistory(db = pool, id) {
  const [requests, donations, stories] = await Promise.all([
    // Pedidos com dados básicos do animal (JOIN com animais).
    db.query(
      `SELECT p.id, p.status, p.prioridade, p.observacoes, p.termo_assinado, p.termo_assinado_em,
              p.data_pedido, p.atualizado_em,
              a.id AS animal_id, a.nome AS animal_nome, a.especie AS animal_especie
       FROM pedidos_adocao p
       JOIN animais a ON a.id = p.animal_id
       WHERE p.adotante_id = $1
       ORDER BY p.data_pedido DESC`,
      [id]
    ),
    // Doações ligadas ao adotante.
    db.query(
      `SELECT id, doador_nome, doador_email, tipo, valor, metodo, status, data
       FROM doacoes WHERE adotante_id = $1 ORDER BY data DESC`,
      [id]
    ),
    // Histórias escritas pelo adotante.
    db.query(
      `SELECT id, animal_id, autor_nome, texto, foto_url, publicado, criado_em
       FROM historias WHERE adotante_id = $1 ORDER BY criado_em DESC`,
      [id]
    ),
  ]);

  return { pedidos: requests.rows, doacoes: donations.rows, historias: stories.rows };
}

/*
 * FUNÇÃO: update (async)
 * O que faz: atualização parcial (só colunas permitidas). Retorno: linha atualizada ou null.
 */
async function update(id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (!update) return findById(pool, id);

  const result = await pool.query(
    `UPDATE adotantes SET ${update.set} WHERE id = ${update.idParam}
     RETURNING id, nome, email, telefone, cidade, estado, endereco, status, criado_em`,
    update.values
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: countOpenRequests (async)
 * O que faz: conta os pedidos em aberto do adotante (anonimizar/excluir só sem pedidos abertos).
 * Retorno (number).
 */
async function countOpenRequests(db, id) {
  const result = await db.query(
    'SELECT COUNT(*)::int AS total FROM pedidos_adocao WHERE adotante_id = $1 AND status = ANY($2::varchar[])',
    [id, adoptionRequest.openStatus]
  );
  return result.rows[0].total;
}

/*
 * FUNÇÃO: scrubLinkedRecords (interna, async)
 * O que faz: apaga dados pessoais nos registros ligados ao titular:
 *   - doações: nome genérico e e-mail removido;
 *   - histórias: autor genérico e despublicadas;
 *   - pedidos: observações substituídas por REMOVED_TEXT.
 */
// Remove dados pessoais vinculados ao titular em doações, histórias e pedidos,
// mantendo os registros (e as estatísticas) sem identificação.
async function scrubLinkedRecords(db, id) {
  await db.query(
    "UPDATE doacoes SET doador_nome = 'Doador anonimizado', doador_email = NULL WHERE adotante_id = $1",
    [id]
  );
  await db.query(
    "UPDATE historias SET autor_nome = 'Autor anonimizado', publicado = false WHERE adotante_id = $1",
    [id]
  );
  await db.query('UPDATE pedidos_adocao SET observacoes = $2 WHERE adotante_id = $1', [id, REMOVED_TEXT]);
}

/*
 * FUNÇÃO: anonymize (async)
 * O que faz: anonimiza o titular: limpa os registros ligados e troca os dados do cadastro.
 * Detalhe do SQL: o e-mail vira "anonimizado-<id>@anonimizado.invalid" ("||" junta textos no SQL);
 *   o domínio ".invalid" é reservado e nunca recebe e-mails; usar o id mantém o e-mail único.
 */
async function anonymize(db, id) {
  await scrubLinkedRecords(db, id);
  await db.query(
    `UPDATE adotantes
     SET nome = $2, email = 'anonimizado-' || id || '@anonimizado.invalid',
         telefone = NULL, cidade = NULL, estado = NULL, endereco = NULL, status = 'inativo'
     WHERE id = $1`,
    [id, ANONYMIZED_NAME]
  );
}

/*
 * FUNÇÃO: remove (async)
 * O que faz: limpa os registros ligados e exclui o cadastro do titular.
 * Retorno (boolean): true se excluiu (rowCount = quantidade de linhas afetadas).
 */
async function remove(db, id) {
  await scrubLinkedRecords(db, id);
  const result = await db.query('DELETE FROM adotantes WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// Exporta o nome de anonimização e as funções.
module.exports = {
  ANONYMIZED_NAME,
  list,
  listForExport,
  findById,
  findHistory,
  update,
  countOpenRequests,
  anonymize,
  remove,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Listas usam SELECT_WITH_COUNTS + buildWhere (busca por nome, e-mail ou
 *     telefone) + GROUP BY para contar pedidos.
 *   - Detalhes juntam o cadastro e o histórico (3 consultas em paralelo).
 *   - LGPD: anonymize/remove primeiro limpam os dados pessoais nas tabelas
 *     ligadas e depois alteram/excluem o cadastro (dentro de uma transação do service).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - LEFT JOIN, GROUP BY, COUNT ... FILTER e arrays no PostgreSQL.
 *   - regexp_replace e busca por telefone só com dígitos.
 *   - SELECT ... FOR UPDATE (travar linhas em transações).
 *   - Anonimização x exclusão de dados pessoais (LGPD).
 *   - Promise.all para consultas independentes em paralelo.
 * ============================================================================
 */
