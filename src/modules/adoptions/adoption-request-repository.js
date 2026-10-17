/*
 * ============================================================================
 * ARQUIVO: adoption-request-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY usado quando o SITE envia um PEDIDO DE ADOÇÃO (formulário
 *   público). Tem as consultas para: conferir o animal, achar ou criar o
 *   adotante pelo e-mail, verificar se já existe pedido em aberto e gravar o
 *   pedido. Todas recebem "db" (a conexão da transação).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - findAnimalForRequest, findAdopterIdByEmail, insertAdopter, hasOpenRequest, insertRequest.
 *   - Reexporta withTransaction (para o service abrir a transação).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values (status abertos) e db/transaction.
 *   - Tabelas: animais, adotantes, pedidos_adocao.
 *   - Usado por: ./adoption-request-service.js.
 * ============================================================================
 */

// Status "em aberto" de pedidos.
const { adoptionRequest } = require('../../config/domain-values');
// Transações.
const withTransaction = require('../../db/transaction');

/*
 * FUNÇÃO: findAnimalForRequest (async)
 * O que faz: busca o animal e o trava em modo compartilhado (FOR SHARE) até o fim da transação:
 *   outros podem ler, mas ninguém altera o status dele enquanto o pedido é gravado.
 * Retorno: { id, nome, status } ou null.
 */
async function findAnimalForRequest(db, animalId) {
  const result = await db.query(
    'SELECT id, nome, status FROM animais WHERE id = $1 FOR SHARE',
    [animalId]
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: findAdopterIdByEmail (async)
 * O que faz: procura o adotante pelo e-mail (sem diferenciar maiúsculas: LOWER).
 * Retorno: o id ou null. "?." evita erro quando não há linha.
 */
async function findAdopterIdByEmail(db, email) {
  const result = await db.query(
    'SELECT id FROM adotantes WHERE LOWER(email) = $1 LIMIT 1',
    [email]
  );
  return result.rows[0]?.id || null;
}

/*
 * FUNÇÃO: insertAdopter (async)
 * O que faz: cria o adotante. "ON CONFLICT (email) DO NOTHING": se o e-mail já existir
 *   (ex.: dois envios ao mesmo tempo), não dá erro e não insere nada.
 * Retorno: o id criado, ou null se não inseriu (aí o service busca o existente).
 */
async function insertAdopter(db, adopter) {
  const result = await db.query(
    `INSERT INTO adotantes (nome, email, telefone, cidade)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [adopter.nome, adopter.email, adopter.telefone, adopter.cidade]
  );
  return result.rows[0]?.id || null;
}

/*
 * FUNÇÃO: hasOpenRequest (async)
 * O que faz: já existe pedido em aberto deste adotante para este animal?
 * Retorno (boolean). "SELECT 1 ... LIMIT 1" só verifica se existe alguma linha.
 */
async function hasOpenRequest(db, adopterId, animalId) {
  const result = await db.query(
    `SELECT 1 FROM pedidos_adocao
     WHERE adotante_id = $1 AND animal_id = $2 AND status = ANY($3::varchar[])
     LIMIT 1`,
    [adopterId, animalId, adoptionRequest.openStatus]
  );
  return result.rows.length > 0;
}

/*
 * FUNÇÃO: insertRequest (async)
 * O que faz: grava o pedido.
 * Parâmetros: request { animalId, adopterId, observacoes, visitaPreferidaEm? }.
 * Retorno: { id, status, data_pedido }.
 */
async function insertRequest(db, request) {
  const result = await db.query(
    `INSERT INTO pedidos_adocao (animal_id, adotante_id, observacoes, visita_preferida_em)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status, data_pedido`,
    [request.animalId, request.adopterId, request.observacoes, request.visitaPreferidaEm || null]
  );
  return result.rows[0];
}

// Exporta as funções (e a transação, para que os testes possam substituí-la).
module.exports = {
  withTransaction,
  findAnimalForRequest,
  findAdopterIdByEmail,
  insertAdopter,
  hasOpenRequest,
  insertRequest,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Dentro de uma transação, o service: trava o animal (FOR SHARE) → acha ou cria
 *   o adotante (ON CONFLICT para envios simultâneos) → confere pedido em aberto →
 *   grava o pedido.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Travas de linha: FOR SHARE x FOR UPDATE.
 *   - INSERT ... ON CONFLICT DO NOTHING (upsert simplificado) e condições de corrida.
 *   - Funções de repository que recebem a conexão da transação.
 * ============================================================================
 */
