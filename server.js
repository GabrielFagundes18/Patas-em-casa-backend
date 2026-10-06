require('dotenv').config();

const app = require('./src/app');
const { pool } = require('./src/config/db');
const { readConfig } = require('./src/config/env');
const logger = require('./src/utils/logger');

const config = readConfig();

const server = app.listen(config.port, () => {
  logger.info('api_started', { port: config.port });
});

server.requestTimeout = config.requestTimeoutMs;
server.headersTimeout = server.requestTimeout + 5000;

const HTTP_DRAIN_TIMEOUT_MS = 5000;
const SHUTDOWN_TIMEOUT_MS = 8000;

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('shutdown_started', { signal });

  // Limite total do encerramento: se o banco não confirmar o fechamento das conexões
  // (ex.: rede do Neon sem resposta), o processo sai mesmo assim e não trava reinícios.
  const forceExitTimer = setTimeout(() => {
    logger.error('shutdown_forced');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  const forceCloseTimer = setTimeout(() => {
    server.closeAllConnections();
  }, HTTP_DRAIN_TIMEOUT_MS);
  forceCloseTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceCloseTimer);

    try {
      await pool.end();
    } catch (poolError) {
      logger.error('database_pool_close_failed');
      process.exitCode = 1;
    }

    if (error) {
      logger.error('http_server_close_failed');
      process.exitCode = 1;
    }

    clearTimeout(forceExitTimer);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));