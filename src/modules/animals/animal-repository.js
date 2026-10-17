/*
 * ============================================================================
 * ARQUIVO: animal-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY dos ANIMAIS (tabela "animais"): todo o SQL de listar (com
 *   filtros, ordenação e paginação), exportar, buscar, criar, atualizar e
 *   excluir animais fica aqui.
 *
 * PRINCIPAIS ITENS:
 *   - SORT_COLUMNS: colunas permitidas para ordenação.
 *   - ANIMAL_COLUMNS: colunas devolvidas.
 *   - UPDATABLE_COLUMNS: colunas que podem ser alteradas.
 *   - buildWhere(filters): monta o WHERE dos filtros (interna).
 *   - list, listForExport, findById, create, update, remove (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/pool e ../../db/sql (createWhere, buildUpdate).
 *   - Usado por: ./animal-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montadores de SQL parametrizado.
const { buildUpdate, createWhere } = require('../../db/sql');

// "Nome pedido na URL" → "coluna do banco". Só estas podem ir para o ORDER BY
// (nomes de coluna não podem ser parâmetros $n, então usamos uma lista fixa por segurança).
const SORT_COLUMNS = Object.freeze({
  nome: 'nome',
  data_entrada: 'data_entrada',
  idade_anos: 'idade_anos',
  status: 'status',
  especie: 'especie',
  porte: 'porte',
});

// Colunas selecionadas nas consultas (texto reutilizado no SELECT e no RETURNING).
const ANIMAL_COLUMNS = `id, nome, especie, raca, sexo, idade_anos, porte, status, descricao,
  foto_url, data_entrada, castrado, vacinado, temperamento, criado_em, atualizado_em`;

// Colunas que um UPDATE pode alterar (id e datas de controle ficam de fora).
const UPDATABLE_COLUMNS = new Set([
  'nome', 'especie', 'raca', 'sexo', 'idade_anos', 'porte', 'status',
  'descricao', 'foto_url', 'data_entrada', 'castrado', 'vacinado', 'temperamento',
]);

/*
 * FUNÇÃO: buildWhere (interna)
 * O que faz: transforma os filtros num WHERE parametrizado.
 * Parâmetros: filters (objeto já normalizado pelo service): q, especie, sexo, porte, status,
 *   statusIn (array), castrado, vacinado, idadeMin, idadeMax.
 * Retorno: { clause: 'WHERE ...' ou '', values: [...] }.
 */
function buildWhere(filters) {
  const where = createWhere();

  // Busca por nome OU raça; ILIKE = LIKE sem diferenciar maiúsculas; "%texto%" = contém o texto.
  // COALESCE(raca, '') evita problemas com raça vazia (NULL).
  if (filters.q) where.add("(nome ILIKE ? OR COALESCE(raca, '') ILIKE ?)", `%${filters.q}%`);
  if (filters.especie) where.add('especie = ?', filters.especie);
  if (filters.sexo) where.add('sexo = ?', filters.sexo);
  if (filters.porte) where.add('porte = ?', filters.porte);
  if (filters.status) where.add('status = ?', filters.status);
  // Vários status: "= ANY(array)" confere se o status está na lista (::varchar[] = converte para array de texto).
  if (filters.statusIn?.length) where.add('status = ANY(?::varchar[])', filters.statusIn);
  // Booleanos: "!== undefined" para aceitar também o valor false.
  if (filters.castrado !== undefined) where.add('castrado = ?', filters.castrado);
  if (filters.vacinado !== undefined) where.add('vacinado = ?', filters.vacinado);
  // Faixa de idade.
  if (filters.idadeMin !== undefined) where.add('idade_anos >= ?', filters.idadeMin);
  if (filters.idadeMax !== undefined) where.add('idade_anos <= ?', filters.idadeMax);

  return { clause: where.clause(), values: where.values };
}

/*
 * FUNÇÃO: list (async)
 * O que faz: lista uma página de animais e conta o total.
 * Parâmetros: filters (com sort, order, pageSize e offset).
 * Retorno: { items: [...], total: number }.
 */
async function list(filters) {
  const { clause, values } = buildWhere(filters);
  // 1ª consulta: total de registros com os filtros (COUNT(*)::int converte para inteiro).
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM animais ${clause}`,
    values
  );
  // Coluna e direção de ordenação (padrão: data de entrada, mais recentes primeiro).
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.data_entrada;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';
  // 2ª consulta: a página. LIMIT e OFFSET usam os próximos números de parâmetro ($n+1, $n+2).
  // "NULLS LAST" põe valores vazios no fim; "id ASC" desempata para a ordem ser sempre a mesma.
  const result = await pool.query(
    `SELECT ${ANIMAL_COLUMNS}
     FROM animais ${clause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.pageSize, filters.offset]
  );

  return { items: result.rows, total: countResult.rows[0].total };
}

/*
 * FUNÇÃO: listForExport (async)
 * O que faz: lista os animais para o CSV (sem paginação), até maxRows + 1 linhas.
 * Parâmetros: filters e maxRows (limite de exportação).
 * Retorno (array). Pegar UMA linha a mais permite ao service saber se o limite foi ultrapassado.
 */
async function listForExport(filters, maxRows) {
  const { clause, values } = buildWhere(filters);
  const sortColumn = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.data_entrada;
  const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';
  const result = await pool.query(
    `SELECT ${ANIMAL_COLUMNS}
     FROM animais ${clause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
     LIMIT $${values.length + 1}`,
    [...values, maxRows + 1]
  );
  return result.rows;
}

/*
 * FUNÇÃO: findById (async)
 * O que faz: busca um animal pelo id. Retorno: a linha ou null.
 */
async function findById(id) {
  const result = await pool.query(
    `SELECT ${ANIMAL_COLUMNS}
     FROM animais WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: create (async)
 * O que faz: insere um animal e devolve a linha criada (RETURNING).
 * Parâmetros: animal (objeto com os campos já validados).
 */
async function create(animal) {
  const result = await pool.query(
    `INSERT INTO animais
      (nome, especie, raca, sexo, idade_anos, porte, status, descricao, foto_url,
       data_entrada, castrado, vacinado, temperamento)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${ANIMAL_COLUMNS}`,
    [
      animal.nome,
      animal.especie,
      animal.raca,
      animal.sexo,
      animal.idade_anos,
      animal.porte,
      animal.status,
      animal.descricao,
      animal.foto_url,
      animal.data_entrada,
      animal.castrado,
      animal.vacinado,
      // Temperamento é uma lista; vazia se não informado.
      animal.temperamento || [],
    ]
  );
  return result.rows[0];
}

/*
 * FUNÇÃO: update (async)
 * O que faz: altera só as colunas enviadas (UPDATE parcial).
 * Parâmetros: id e changes (objeto com as alterações).
 * Retorno: a linha atualizada (ou a atual, se nada mudou; ou null se o animal não existir).
 */
async function update(id, changes) {
  // buildUpdate monta "coluna = $1, ..." só com colunas permitidas.
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  // Nada a alterar: devolve o registro como está.
  if (!update) return findById(id);

  const result = await pool.query(
    `UPDATE animais SET ${update.set} WHERE id = ${update.idParam}
     RETURNING ${ANIMAL_COLUMNS}`,
    update.values
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: remove (async)
 * O que faz: exclui o animal. Retorno: { id } se excluiu, ou null se não existia.
 */
async function remove(id) {
  const result = await pool.query('DELETE FROM animais WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

// Exporta as funções públicas.
module.exports = { list, listForExport, findById, create, update, remove };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O service normaliza os filtros e chama list/listForExport (que usam buildWhere,
 *   ordenação de lista fixa e LIMIT/OFFSET), ou as operações de CRUD por id.
 *   Todos os valores vão como parâmetros; só nomes fixos de colunas entram no texto.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - SQL: SELECT com filtros dinâmicos, COUNT, ORDER BY ... NULLS LAST, LIMIT/OFFSET.
 *   - ILIKE, ANY(array) e COALESCE no PostgreSQL.
 *   - INSERT/UPDATE/DELETE com RETURNING.
 *   - Lista de permissões para colunas de ordenação e atualização.
 * ============================================================================
 */
