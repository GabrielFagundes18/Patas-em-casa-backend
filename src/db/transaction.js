const pool = require('./db');

// Executa work(client) dentro de BEGIN/COMMIT; qualquer erro desfaz tudo (ROLLBACK).
// Se o ROLLBACK falhar, a conexão é descartada em vez de voltar ao pool.
async function withTransaction(work) {
  const client = await pool.connect();
  let releaseError;

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = rollbackError;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

module.exports = withTransaction;
