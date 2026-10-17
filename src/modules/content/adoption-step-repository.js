/*
 * ============================================================================
 * ARQUIVO: adoption-step-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY dos PASSOS DA ADOÇÃO (seção "Como adotar" do site). Lê da tabela
 *   adoption_steps os passos ativos, em ordem, já com os nomes de campo em
 *   português que o frontend espera.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - listActive(): lista os passos ativos.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/pool. Tabela adoption_steps (schema 000).
 *   - Usado por: ./adoption-step-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');

/*
 * FUNÇÃO: listActive (async)
 * O que faz: busca os passos ativos, em ordem.
 * Parâmetros: nenhum.
 * Retorno (array): [{ ordem, titulo, descricao }, ...].
 * Detalhes do SQL:
 *   - "AS ordem" renomeia a coluna no resultado (step_order → ordem).
 *   - "IS NOT FALSE" aceita true e também NULL (passos sem valor definido contam como ativos).
 */
async function listActive() {
  const result = await pool.query(
    `SELECT step_order AS ordem, title AS titulo, description AS descricao
     FROM adoption_steps
     WHERE is_active IS NOT FALSE
     ORDER BY step_order`
  );
  return result.rows;
}

// Exporta a função.
module.exports = { listActive };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   GET /api/v1/public/adoption-steps → public-controller → service → listActive()
 *   → linhas do banco com nomes em português → JSON para o site.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - SELECT com apelidos de colunas (AS), WHERE e ORDER BY.
 *   - Lógica de três valores no SQL (TRUE, FALSE e NULL) e "IS NOT FALSE".
 * ============================================================================
 */
