const pool = require('../../src/db/pool');

function sqlText(query) {
  return typeof query === 'string' ? query : query?.text || '';
}

// Executa work(client) dentro de uma transação que é SEMPRE desfeita (ROLLBACK) no final:
// os testes de integração usam o banco real sem deixar nenhum dado gravado.
// - pool.query da aplicação passa a usar a mesma conexão; escritas ganham um SAVEPOINT próprio,
//   para que um erro esperado (ex.: e-mail duplicado) não aborte a transação do teste;
// - transações abertas pela aplicação (BEGIN/COMMIT/ROLLBACK) viram SAVEPOINTs.
// Com freshSchemaSql, cria um schema vazio a partir do SQL informado e o usa no lugar de "public"
// (simula o banco novo do CI sem tocar nos dados existentes).
async function withRollback(work, { freshSchemaSql } = {}) {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  const nestedClient = {
    async query(query, values) {
      const command = sqlText(query).trim().toUpperCase();
      if (command === 'BEGIN') return client.query('SAVEPOINT app_transaction');
      if (command === 'COMMIT') return client.query('RELEASE SAVEPOINT app_transaction');
      if (command === 'ROLLBACK') {
        await client.query('ROLLBACK TO SAVEPOINT app_transaction');
        return client.query('RELEASE SAVEPOINT app_transaction');
      }
      return client.query(query, values);
    },
    release() {},
  };

  await client.query('BEGIN');
  if (freshSchemaSql) {
    await client.query('CREATE SCHEMA integracao_vazio');
    await client.query('SET LOCAL search_path TO integracao_vazio, public');
    await client.query(freshSchemaSql);
  }
  pool.query = async (query, values) => {
    if (/^\s*SELECT\b/i.test(sqlText(query))) return client.query(query, values);

    await client.query('SAVEPOINT pool_query');
    try {
      const result = await client.query(query, values);
      await client.query('RELEASE SAVEPOINT pool_query');
      return result;
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT pool_query');
      await client.query('RELEASE SAVEPOINT pool_query');
      throw error;
    }
  };
  pool.connect = async () => nestedClient;

  try {
    return await work(client);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
  }
}

module.exports = { withRollback };
