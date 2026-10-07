const pool = require('./pool');

const connectionString = process.env.DATABASE_URL || '';
const CONNECTION_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;
const QUERY_TIMEOUT_MS = 10000;

async function testConnection() {
	if (!connectionString) {
		return { ok: false, mode: 'mock' };
	}

	let lastError;

	for (let attempt = 1; attempt <= CONNECTION_ATTEMPTS; attempt += 1) {
		try {
			const result = await pool.query({
				text: 'SELECT 1 AS ok',
				query_timeout: QUERY_TIMEOUT_MS,
			});
			return { ok: result.rowCount > 0, mode: 'database' };
		} catch (error) {
			lastError = error;

			if (attempt < CONNECTION_ATTEMPTS) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
			}
		}
	}

	throw lastError;
}

module.exports = { pool, testConnection };
