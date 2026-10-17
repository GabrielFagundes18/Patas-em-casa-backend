/*
 * ============================================================================
 * ARQUIVO: server.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   É o PONTO DE PARTIDA do backend (o "main" do package.json). Quando rodamos
 *   "npm start" (ou "npm run dev"), o Node executa este arquivo, que:
 *     1. lê a configuração (porta, tempo limite...);
 *     2. coloca a aplicação Express (src/app.js) para "escutar" a porta;
 *     3. cuida do DESLIGAMENTO GRACIOSO: ao receber um sinal para parar
 *        (SIGTERM/SIGINT), termina as requisições em andamento e fecha as
 *        conexões com o banco antes de sair.
 *
 * PRINCIPAIS ITENS:
 *   - config: configuração lida do ambiente (.env).
 *   - server: o servidor HTTP criado por app.listen().
 *   - shutdown(signal): função que encerra o servidor com segurança.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./src/app → a aplicação Express com todas as rotas e middlewares.
 *   - ./src/db/connection-check → "pool" de conexões com o PostgreSQL.
 *   - ./src/config/env → readConfig() (lê e valida as variáveis de ambiente).
 *   - ./src/utils/logger → registro de eventos (logs) em formato estruturado.
 * ============================================================================
 */

// "require" é a forma do Node (CommonJS) de importar outro arquivo/módulo.
// A aplicação Express já montada (rotas, middlewares...).
const app = require('./src/app');
// "Pool" de conexões com o banco. As chaves { } pegam só a propriedade "pool" do objeto exportado
// (isso se chama "desestruturação").
const { pool } = require('./src/db/connection-check');
// Função que lê e valida a configuração.
const { readConfig } = require('./src/config/env');
// Registro de logs.
const logger = require('./src/utils/logger');

// Lê a configuração uma vez (porta, tempo limite das requisições etc.).
const config = readConfig();

// app.listen(porta, callback) abre o servidor HTTP na porta indicada.
// O callback (a função "() => {...}") roda quando o servidor já está pronto para receber requisições.
// O retorno é o objeto "server" (servidor HTTP do Node), usado mais abaixo.
const server = app.listen(config.port, () => {
  // Log informando que a API subiu e em qual porta.
  logger.info('api_started', { port: config.port });
});

// Tempo máximo (em ms) para receber uma requisição inteira; depois disso o Node a encerra.
server.requestTimeout = config.requestTimeoutMs;
// Tempo máximo para receber os cabeçalhos: um pouco maior (5 s a mais) que o da requisição.
server.headersTimeout = server.requestTimeout + 5000;

// Constantes (em milissegundos) do desligamento:
// - HTTP_DRAIN_TIMEOUT_MS: quanto esperar as requisições em andamento terminarem;
// - SHUTDOWN_TIMEOUT_MS: limite total do desligamento antes de forçar a saída.
const HTTP_DRAIN_TIMEOUT_MS = 5000;
const SHUTDOWN_TIMEOUT_MS = 8000;

// "Trava" para não executar o desligamento duas vezes (ex.: dois sinais seguidos).
// "let" porque o valor muda depois.
let shuttingDown = false;

/*
 * FUNÇÃO: shutdown
 * O que faz: desliga o servidor de forma graciosa (sem cortar requisições no meio).
 * Parâmetros:
 *   - signal (string): nome do sinal recebido ('SIGTERM' ou 'SIGINT'), só para o log.
 * Retorno: nada (undefined).
 * Onde é usada: nos "ouvintes" de sinais no fim deste arquivo.
 *   - SIGTERM: enviado por plataformas (Docker, Render...) ao parar/reiniciar o serviço.
 *   - SIGINT: enviado quando apertamos Ctrl+C no terminal.
 */
function shutdown(signal) {
  // Se já está desligando, não faz nada ("return" sai da função na hora).
  if (shuttingDown) return;
  // Marca que o desligamento começou.
  shuttingDown = true;

  // Registra o início do desligamento e qual sinal o causou.
  logger.info('shutdown_started', { signal });

  // Limite total do encerramento: se o banco não confirmar o fechamento das conexões
  // (ex.: rede do Neon sem resposta), o processo sai mesmo assim e não trava reinícios.
  // setTimeout(função, tempo) agenda a função para rodar depois do tempo indicado.
  const forceExitTimer = setTimeout(() => {
    logger.error('shutdown_forced');
    // Encerra o processo imediatamente com código 1 (= saída com erro).
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // unref(): este temporizador não "segura" o processo vivo. Se todo o resto terminar antes,
  // o Node pode sair sem esperar por ele.
  forceExitTimer.unref();

  // Depois de 5 s, fecha à força as conexões HTTP que ainda estiverem abertas.
  const forceCloseTimer = setTimeout(() => {
    server.closeAllConnections();
  }, HTTP_DRAIN_TIMEOUT_MS);
  forceCloseTimer.unref();

  // server.close() para de aceitar NOVAS conexões e espera as atuais terminarem.
  // Quando tudo fecha, chama o callback. "async" permite usar "await" dentro dele.
  server.close(async (error) => {
    // O HTTP já fechou: o temporizador de fechamento forçado não é mais necessário.
    clearTimeout(forceCloseTimer);

    // try/catch: tenta fechar o pool do banco; se der erro, cai no "catch".
    try {
      // "await" espera a Promise de pool.end() terminar (todas as conexões fechadas).
      await pool.end();
    } catch (poolError) {
      logger.error('database_pool_close_failed');
      // process.exitCode define o código de saída SEM encerrar na hora (o processo sai sozinho depois).
      process.exitCode = 1;
    }

    // Se o próprio fechamento do servidor HTTP teve erro, registra e marca saída com erro.
    if (error) {
      logger.error('http_server_close_failed');
      process.exitCode = 1;
    }

    // Tudo encerrado a tempo: cancela a saída forçada.
    clearTimeout(forceExitTimer);
  });
}

// process.once(evento, função): executa a função UMA vez quando o processo receber o sinal.
// SIGTERM → pedido de término (plataformas de hospedagem, Docker).
process.once('SIGTERM', () => shutdown('SIGTERM'));
// SIGINT → Ctrl+C no terminal.
process.once('SIGINT', () => shutdown('SIGINT'));

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. Importa a aplicação (app), o pool do banco, a configuração e o logger.
 *   2. Lê a configuração e abre o servidor HTTP na porta configurada.
 *   3. Define os tempos limite de requisição e de cabeçalhos.
 *   4. Ao receber SIGTERM ou SIGINT, shutdown():
 *        - para de aceitar conexões novas e espera as atuais (até 5 s);
 *        - fecha o pool do banco;
 *        - se algo travar, força a saída após 8 s.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - CommonJS: require e module.exports.
 *   - Servidor HTTP do Node e app.listen() do Express.
 *   - Sinais do sistema operacional (SIGTERM, SIGINT) e desligamento gracioso.
 *   - setTimeout, clearTimeout e timer.unref().
 *   - process.exit() x process.exitCode.
 *   - async/await e try/catch.
 * ============================================================================
 */
