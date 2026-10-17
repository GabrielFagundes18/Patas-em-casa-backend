/*
 * ============================================================================
 * ARQUIVO: animal-media-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY da GALERIA DE FOTOS dos animais (tabela animais_midias). Cada
 *   linha guarda a "chave" do arquivo no disco (nome), tipo, tamanho, ordem e
 *   se é a foto principal (só uma principal por animal).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - listForAnimal, create, findById, remove, setPrincipal.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/pool. Tabela animais_midias (migration 012).
 *   - Usado por: ./animal-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');

// Galeria de fotos dos animais (migration 012).
// Colunas devolvidas em todas as consultas.
const COLUMNS = 'id, animal_id, objeto_chave, mime_type, tamanho_bytes, ordem, principal, criado_em';

/*
 * FUNÇÃO: listForAnimal (async)
 * O que faz: lista as fotos de um animal: a principal primeiro, depois pela ordem e pela data.
 * Parâmetros: animalId (UUID), db (opcional; padrão pool).
 * Retorno (array de linhas).
 * Detalhe: "principal DESC" põe true antes de false.
 */
async function listForAnimal(animalId, db = pool) {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM animais_midias WHERE animal_id = $1 ORDER BY principal DESC, ordem, criado_em`,
    [animalId]
  );
  return result.rows;
}

/*
 * FUNÇÃO: create (async)
 * O que faz: registra uma foto nova no fim da galeria.
 * Parâmetros: { animalId, objetoChave, mimeType, tamanhoBytes, principal }, db (opcional).
 * Retorno: a linha criada.
 * Detalhe do SQL: a "ordem" é calculada por uma subconsulta: maior ordem atual + 1,
 *   ou 0 se ainda não houver fotos (COALESCE troca NULL por 0).
 */
async function create({ animalId, objetoChave, mimeType, tamanhoBytes, principal }, db = pool) {
  const result = await db.query(
    `INSERT INTO animais_midias (animal_id, objeto_chave, mime_type, tamanho_bytes, ordem, principal)
     VALUES ($1, $2, $3, $4,
             (SELECT COALESCE(MAX(ordem) + 1, 0) FROM animais_midias WHERE animal_id = $1), $5)
     RETURNING ${COLUMNS}`,
    [animalId, objetoChave, mimeType, tamanhoBytes, principal]
  );
  return result.rows[0];
}

/*
 * FUNÇÃO: findById (async)
 * O que faz: busca uma foto pelo id. Retorno: a linha ou null.
 */
async function findById(id, db = pool) {
  const result = await db.query(`SELECT ${COLUMNS} FROM animais_midias WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: remove (async)
 * O que faz: apaga o registro da foto (o arquivo no disco é apagado pelo service).
 */
async function remove(id, db = pool) {
  await db.query('DELETE FROM animais_midias WHERE id = $1', [id]);
}

/*
 * FUNÇÃO: setPrincipal (async)
 * O que faz: troca a foto principal do animal.
 * Parâmetros: animalId, id (da nova principal), db (opcional; o service usa uma transação).
 */
// Desmarca a principal atual antes de marcar a nova (o índice único permite só uma por animal).
async function setPrincipal(animalId, id, db = pool) {
  // "AND principal" = só onde principal é true.
  await db.query('UPDATE animais_midias SET principal = false WHERE animal_id = $1 AND principal', [animalId]);
  await db.query('UPDATE animais_midias SET principal = true WHERE id = $1', [id]);
}

// Exporta as funções.
module.exports = { listForAnimal, create, findById, remove, setPrincipal };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O animal-service grava o arquivo (photo-storage) e chama create; lista com
 *   listForAnimal; troca a capa com setPrincipal (em transação); e apaga com remove.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Subconsultas dentro de INSERT e a função COALESCE.
 *   - Índice único parcial (uma única foto principal por animal).
 *   - Ordenação por várias colunas (ORDER BY a DESC, b, c).
 *   - Parâmetro "db" opcional para participar de transações.
 * ============================================================================
 */
