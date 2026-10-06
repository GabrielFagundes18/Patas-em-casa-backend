const { Pool, types } = require('pg');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

// Colunas DATE (OID 1082) chegam como texto AAAA-MM-DD; convertê-las em Date
// aplicaria o fuso do servidor e poderia deslocar o dia (ex.: data_entrada).
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value) => value);

// Prioriza a conexão direta (Neon) e faz fallback para DATABASE_URL
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || '';
const QUERY_TIMEOUT_MS = 10000;

const pool = new Pool({
    connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
});

// A mensagem do driver pode conter detalhes da conexão; o log registra só o código.
pool.on('error', (error) => {
    logger.error('database_pool_error', { code: error.code || 'desconhecido' });
});

module.exports = pool;