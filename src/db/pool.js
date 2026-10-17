/*
 * ============================================================================
 * ARQUIVO: pool.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Cria o POOL DE CONEXÕES com o PostgreSQL. Um "pool" é um grupo de conexões
 *   abertas e reutilizadas: em vez de abrir uma conexão nova a cada consulta
 *   (o que é lento), a API pega uma conexão livre do pool, usa e devolve.
 *   Também ajusta como as colunas do tipo DATE são lidas.
 *
 * PRINCIPAIS ITENS:
 *   - pool: o pool de conexões (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - pg (biblioteca de acesso ao PostgreSQL), dotenv, ../utils/logger.
 *   - Usado por: ./connection-check.js, ./transaction.js e todos os repositories
 *     (modules/*\/...-repository.js), que fazem as consultas SQL.
 * ============================================================================
 */

// Pool (grupo de conexões) e "types" (configura a conversão de tipos do banco para o JavaScript).
const { Pool, types } = require('pg');
// Carrega as variáveis do arquivo .env.
const dotenv = require('dotenv');
// Registro de logs.
const logger = require('../utils/logger');

// Lê o .env para process.env.
dotenv.config();

// Colunas DATE (OID 1082) chegam como texto AAAA-MM-DD; convertê-las em Date
// aplicaria o fuso do servidor e poderia deslocar o dia (ex.: data_entrada).
// OID = número interno que o PostgreSQL usa para identificar cada tipo de dado.
const DATE_OID = 1082;
// setTypeParser(tipo, função): diz como converter o valor. "(value) => value" mantém o texto como veio.
types.setTypeParser(DATE_OID, (value) => value);

// Prioriza a conexão direta (Neon) e faz fallback para DATABASE_URL
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || '';
// Tempo máximo para conseguir uma conexão (10 s).
const QUERY_TIMEOUT_MS = 10000;

// Cria o pool com as opções:
const pool = new Pool({
    // Endereço do banco.
    connectionString,
    // Conexão criptografada (SSL) quando há banco configurado. rejectUnauthorized: false aceita o
    // certificado sem verificar quem o emitiu (mais simples, porém menos rígido que a verificação completa).
    ssl: connectionString ? { rejectUnauthorized: false } : false,
    // No máximo 10 conexões abertas ao mesmo tempo.
    max: 10,
    // Conexão parada por 30 s é fechada.
    idleTimeoutMillis: 30000,
    // Desiste de conectar depois de 10 s.
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
});

// A mensagem do driver pode conter detalhes da conexão; o log registra só o código.
// pool.on('error', ...) trata erros de conexões ociosas (sem isso, o processo poderia cair).
pool.on('error', (error) => {
    logger.error('database_pool_error', { code: error.code || 'desconhecido' });
});

// Exporta o pool para o resto do backend.
module.exports = pool;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. Ajusta o leitor de datas (DATE continua texto, sem conversão de fuso).
 *   2. Escolhe o endereço do banco (direto do Neon ou o padrão).
 *   3. Cria o pool com SSL, limite de conexões e tempos de espera.
 *   4. Registra erros do pool no log sem expor dados sensíveis.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Pool de conexões e por que reutilizar conexões.
 *   - Biblioteca "pg" (node-postgres): Pool, query e conversores de tipo.
 *   - Fusos horários e o perigo de converter datas sem hora em Date.
 *   - SSL em conexões com o banco.
 *   - Não registrar segredos/detalhes de conexão nos logs.
 * ============================================================================
 */
