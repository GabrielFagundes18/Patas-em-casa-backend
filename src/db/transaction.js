/*
 * ============================================================================
 * ARQUIVO: transaction.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Executa várias operações no banco dentro de uma TRANSAÇÃO. Transação é um
 *   "tudo ou nada": ou todas as operações são gravadas juntas (COMMIT), ou, se
 *   alguma falhar, nenhuma fica gravada (ROLLBACK). Exemplo: aprovar uma adoção
 *   muda o pedido E o status do animal; não pode acontecer só metade.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - withTransaction(work): roda a função "work" dentro de BEGIN/COMMIT (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./pool → de onde vem a conexão.
 *   - Usado por: services que fazem várias gravações juntas (adoções, animais,
 *     adotantes, doações, usuários, autenticação...).
 * ============================================================================
 */

// Pool de conexões.
const pool = require('./pool');

/*
 * FUNÇÃO: withTransaction (async)
 * O que faz: pega uma conexão, abre a transação, executa work(client) e confirma.
 * Parâmetros:
 *   - work (função async): recebe "client" (a conexão da transação) e faz as consultas com ele.
 *     Todas as consultas precisam usar ESSE client para fazer parte da transação.
 * Retorno (Promise): o que "work" retornar. Se der erro, a Promise é rejeitada com o mesmo erro.
 */
// Executa work(client) dentro de BEGIN/COMMIT; qualquer erro desfaz tudo (ROLLBACK).
// Se o ROLLBACK falhar, a conexão é descartada em vez de voltar ao pool.
async function withTransaction(work) {
  // Reserva uma conexão exclusiva do pool.
  const client = await pool.connect();
  // Erro do ROLLBACK (se houver); usado no release lá embaixo.
  let releaseError;

  try {
    // Inicia a transação.
    await client.query('BEGIN');
    // Executa o trabalho pedido.
    const result = await work(client);
    // Deu tudo certo: grava de vez.
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Algo falhou: tenta desfazer tudo.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Se nem o ROLLBACK funcionou, a conexão pode estar "quebrada": guardamos o erro.
      releaseError = rollbackError;
    }
    // Repassa o erro original para quem chamou.
    throw error;
  } finally {
    // "finally" roda sempre (com ou sem erro): devolve a conexão ao pool.
    // release(erro) com um erro DESCARTA a conexão em vez de reutilizá-la.
    client.release(releaseError);
  }
}

// Exporta a função diretamente (require('./transaction') já é a função).
module.exports = withTransaction;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   pool.connect → BEGIN → work(client) → COMMIT → devolve o resultado.
 *   Em erro: ROLLBACK (se falhar, marca a conexão para descarte) → relança o erro.
 *   Sempre: client.release() devolve (ou descarta) a conexão.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Transações de banco de dados (BEGIN, COMMIT, ROLLBACK) e atomicidade (ACID).
 *   - try / catch / finally.
 *   - Funções que recebem outras funções como parâmetro (callbacks / "funções de ordem superior").
 *   - Conexão exclusiva do pool (pool.connect + client.release).
 * ============================================================================
 */
