const pool = require('../../db/pool');

// Galeria de fotos dos animais (migration 012).
const COLUMNS = 'id, animal_id, objeto_chave, mime_type, tamanho_bytes, ordem, principal, criado_em';

async function listForAnimal(animalId, db = pool) {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM animais_midias WHERE animal_id = $1 ORDER BY principal DESC, ordem, criado_em`,
    [animalId]
  );
  return result.rows;
}

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

async function findById(id, db = pool) {
  const result = await db.query(`SELECT ${COLUMNS} FROM animais_midias WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function remove(id, db = pool) {
  await db.query('DELETE FROM animais_midias WHERE id = $1', [id]);
}

// Desmarca a principal atual antes de marcar a nova (o índice único permite só uma por animal).
async function setPrincipal(animalId, id, db = pool) {
  await db.query('UPDATE animais_midias SET principal = false WHERE animal_id = $1 AND principal', [animalId]);
  await db.query('UPDATE animais_midias SET principal = true WHERE id = $1', [id]);
}

module.exports = { listForAnimal, create, findById, remove, setPrincipal };
