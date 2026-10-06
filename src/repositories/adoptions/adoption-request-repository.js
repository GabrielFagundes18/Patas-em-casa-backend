const { adoptionRequest } = require('../../config/domain-values');
const withTransaction = require('../../db/transaction');

async function findAnimalForRequest(db, animalId) {
  const result = await db.query(
    'SELECT id, nome, status FROM animais WHERE id = $1 FOR SHARE',
    [animalId]
  );
  return result.rows[0] || null;
}

async function findAdopterIdByEmail(db, email) {
  const result = await db.query(
    'SELECT id FROM adotantes WHERE LOWER(email) = $1 LIMIT 1',
    [email]
  );
  return result.rows[0]?.id || null;
}

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

async function hasOpenRequest(db, adopterId, animalId) {
  const result = await db.query(
    `SELECT 1 FROM pedidos_adocao
     WHERE adotante_id = $1 AND animal_id = $2 AND status = ANY($3::varchar[])
     LIMIT 1`,
    [adopterId, animalId, adoptionRequest.openStatus]
  );
  return result.rows.length > 0;
}

async function insertRequest(db, request) {
  const result = await db.query(
    `INSERT INTO pedidos_adocao (animal_id, adotante_id, observacoes)
     VALUES ($1, $2, $3)
     RETURNING id, status, data_pedido`,
    [request.animalId, request.adopterId, request.observacoes]
  );
  return result.rows[0];
}

module.exports = {
  withTransaction,
  findAnimalForRequest,
  findAdopterIdByEmail,
  insertAdopter,
  hasOpenRequest,
  insertRequest,
};
