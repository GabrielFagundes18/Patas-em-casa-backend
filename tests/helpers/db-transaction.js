/*
 * ============================================================================
 * ARQUIVO: db-transaction.js (auxiliar de testes)
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Permite que os TESTES DE INTEGRAÇÃO usem o banco de dados REAL sem deixar
 *   nenhum dado gravado. Tudo o que o teste faz roda dentro de uma transação
 *   que, no final, é SEMPRE desfeita (ROLLBACK). Para isso, o arquivo "troca"
 *   temporariamente pool.query e pool.connect da aplicação, fazendo a API usar
 *   a mesma conexão do teste.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - sqlText(query): extrai o texto SQL de uma consulta (interna).
 *   - withRollback(work, { freshSchemaSql }): executa o teste dentro da transação (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../src/db/pool.
 *   - Usado por: tests/integration/api-flows.test.js.
 * ============================================================================
 */

// Pool da aplicação (o mesmo objeto que os repositories usam).
const pool = require('../../src/db/pool');

/*
 * FUNÇÃO: sqlText
 * O que faz: devolve o texto do SQL, seja a consulta uma string ou um objeto { text, ... }.
 */
function sqlText(query) {
  return typeof query === 'string' ? query : query?.text || '';
}

/*
 * FUNÇÃO: withRollback (async, exportada)
 * Parâmetros:
 *   - work (função async): o corpo do teste; recebe o client da transação.
 *   - { freshSchemaSql } (opcional): SQL para criar um schema vazio e usá-lo no lugar de "public".
 * Retorno: o que "work" retornar.
 * Técnicas usadas:
 *   - SAVEPOINT: um "ponto de salvamento" dentro da transação; dá para desfazer até ele
 *     (ROLLBACK TO SAVEPOINT) sem perder a transação inteira.
 *   - "Monkey patching": substituir funções de um objeto em tempo de execução (pool.query/connect)
 *     e restaurar as originais no final.
 */
// Executa work(client) dentro de uma transação que é SEMPRE desfeita (ROLLBACK) no final:
// os testes de integração usam o banco real sem deixar nenhum dado gravado.
// - pool.query da aplicação passa a usar a mesma conexão; escritas ganham um SAVEPOINT próprio,
//   para que um erro esperado (ex.: e-mail duplicado) não aborte a transação do teste;
// - transações abertas pela aplicação (BEGIN/COMMIT/ROLLBACK) viram SAVEPOINTs.
// Com freshSchemaSql, cria um schema vazio a partir do SQL informado e o usa no lugar de "public"
// (simula o banco novo do CI sem tocar nos dados existentes).
async function withRollback(work, { freshSchemaSql } = {}) {
  // Conexão exclusiva do teste.
  const client = await pool.connect();
  // Guarda as funções originais para restaurar depois.
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  // "Client" entregue à aplicação quando ela pede pool.connect() (ex.: withTransaction):
  // BEGIN/COMMIT/ROLLBACK da aplicação viram operações de SAVEPOINT dentro da transação do teste.
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
    // release() não faz nada: a conexão de verdade é liberada só no fim do teste.
    release() {},
  };

  // Abre a transação do teste.
  await client.query('BEGIN');
  // Opcional: cria um schema vazio e o coloca primeiro no "search_path" (onde o banco procura as tabelas).
  if (freshSchemaSql) {
    await client.query('CREATE SCHEMA integracao_vazio');
    await client.query('SET LOCAL search_path TO integracao_vazio, public');
    await client.query(freshSchemaSql);
  }
  // Substitui pool.query: leituras vão direto; escritas ganham um SAVEPOINT próprio.
  pool.query = async (query, values) => {
    if (/^\s*SELECT\b/i.test(sqlText(query))) return client.query(query, values);

    await client.query('SAVEPOINT pool_query');
    try {
      const result = await client.query(query, values);
      await client.query('RELEASE SAVEPOINT pool_query');
      return result;
    } catch (error) {
      // Desfaz só esta escrita e mantém a transação do teste viva.
      await client.query('ROLLBACK TO SAVEPOINT pool_query');
      await client.query('RELEASE SAVEPOINT pool_query');
      throw error;
    }
  };
  // Substitui pool.connect: a aplicação recebe o nestedClient.
  pool.connect = async () => nestedClient;

  try {
    return await work(client);
  } finally {
    // Sempre: restaura as funções, desfaz tudo e devolve a conexão.
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
  }
}

// Exporta a função.
module.exports = { withRollback };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   BEGIN → (schema vazio opcional) → troca pool.query/connect → executa o teste →
 *   restaura as funções → ROLLBACK (nada fica gravado).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testes de integração com banco real e isolamento por transação.
 *   - SAVEPOINT, ROLLBACK TO SAVEPOINT e RELEASE SAVEPOINT.
 *   - search_path e schemas no PostgreSQL.
 *   - Substituição temporária de funções (monkey patching) e try/finally.
 * ============================================================================
 */
