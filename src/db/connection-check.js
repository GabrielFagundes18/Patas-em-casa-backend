/*
 * ============================================================================
 * ARQUIVO: connection-check.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Testa se a API consegue conversar com o banco de dados PostgreSQL. Faz uma
 *   consulta mínima ("SELECT 1") e, se falhar, tenta de novo algumas vezes antes
 *   de desistir (a rede ou o banco podem demorar a "acordar", como no Neon).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - testConnection(): testa a conexão com até 3 tentativas.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./pool → o pool de conexões (reexportado aqui junto com testConnection).
 *   - Usado por: server.js (pool, para fechar no desligamento) e
 *     modules/health (rota que informa se o banco está pronto).
 * ============================================================================
 */

// Pool de conexões com o banco (criado em pool.js).
const pool = require('./pool');

// Endereço do banco. Sem ele, a API roda em modo "mock" (sem banco).
const connectionString = process.env.DATABASE_URL || '';
// Quantas vezes tentar.
const CONNECTION_ATTEMPTS = 3;
// Espera base entre tentativas (cresce a cada tentativa).
const RETRY_DELAY_MS = 400;
// Tempo máximo de cada consulta de teste.
const QUERY_TIMEOUT_MS = 10000;

/*
 * FUNÇÃO: testConnection (async)
 * O que faz: executa "SELECT 1" no banco, com até 3 tentativas.
 * Parâmetros: nenhum.
 * Retorno (Promise): resolve com
 *   - { ok: false, mode: 'mock' } se não houver DATABASE_URL;
 *   - { ok: true/false, mode: 'database' } se a consulta respondeu.
 *   Se todas as tentativas falharem, a Promise é rejeitada com o último erro.
 * Onde é usada: rota de prontidão (health-controller).
 */
async function testConnection() {
	// Sem endereço do banco: nem tenta conectar.
	if (!connectionString) {
		return { ok: false, mode: 'mock' };
	}

	// Guarda o erro da última tentativa (para lançar no final, se todas falharem).
	let lastError;

	// Laço de tentativas: attempt vale 1, 2 e 3.
	for (let attempt = 1; attempt <= CONNECTION_ATTEMPTS; attempt += 1) {
		try {
			// Consulta mínima. "query_timeout" limita quanto tempo esperamos a resposta.
			const result = await pool.query({
				text: 'SELECT 1 AS ok',
				query_timeout: QUERY_TIMEOUT_MS,
			});
			// rowCount = quantidade de linhas devolvidas; > 0 significa que o banco respondeu.
			return { ok: result.rowCount > 0, mode: 'database' };
		} catch (error) {
			// Falhou: guarda o erro.
			lastError = error;

			// Se ainda há tentativas, espera antes de repetir: 400 ms, depois 800 ms...
			// "new Promise(resolve => setTimeout(resolve, ms))" é o jeito de "dormir" com await.
			if (attempt < CONNECTION_ATTEMPTS) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
			}
		}
	}

	// Todas as tentativas falharam: lança o último erro (quem chamou trata).
	throw lastError;
}

// Exporta o pool e a função de teste.
module.exports = { pool, testConnection };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   testConnection() verifica se há endereço do banco; se houver, tenta "SELECT 1"
 *   até 3 vezes, esperando um pouco mais a cada falha (400 ms, 800 ms). Responde
 *   com o resultado ou lança o último erro.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Repetição com espera crescente (retry com backoff).
 *   - async/await dentro de laços for e try/catch.
 *   - Criar uma pausa com Promise + setTimeout.
 *   - Health checks (verificações de saúde) de APIs.
 * ============================================================================
 */
