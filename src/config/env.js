/*
 * ============================================================================
 * ARQUIVO: env.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Lê as VARIÁVEIS DE AMBIENTE (arquivo .env ou variáveis do servidor), aplica
 *   valores padrão e VALIDA tudo. Se algo estiver errado (ex.: porta inválida,
 *   segredo curto em produção), lança um erro logo ao iniciar, em vez de a API
 *   falhar de forma estranha depois. Devolve um objeto de configuração "congelado"
 *   (não pode ser alterado por engano).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - getSecret(env, nodeEnv, name): pega um segredo (ou gera um aleatório fora de produção).
 *   - parseInteger(value, fallback, name, min, max): converte e valida um número inteiro.
 *   - parseTrustProxy(value): interpreta a variável TRUST_PROXY.
 *   - readEmailConfig(env): configuração do envio de e-mails (SMTP), opcional.
 *   - readUrl(value, name): valida e normaliza uma URL.
 *   - readMercadoPagoConfig(env): configuração do Mercado Pago, opcional.
 *   - readConfig(env): junta e valida tudo (a única função exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto (randomBytes) e dotenv (carrega o arquivo .env).
 *   - Usado por: server.js, src/app.js, src/db/pool.js, middlewares de autenticação,
 *     integrações de e-mail/pagamento/fotos e vários services.
 *   - Os nomes das variáveis estão documentados em .env.example.
 * ============================================================================
 */

// randomBytes gera bytes aleatórios seguros (criptográficos).
const { randomBytes } = require('node:crypto');

// dotenv lê o arquivo .env e coloca cada linha "NOME=valor" em process.env.NOME.
require('dotenv').config();

// Ambientes aceitos. "Set" é uma coleção sem repetições, com busca rápida via .has().
const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'production']);
// Valores padrão usados quando a variável não é informada.
const DEFAULT_PORT = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_SESSION_IDLE_MINUTES = 30;
const DEFAULT_SESSION_MAX_HOURS = 12;
// Guarda os segredos gerados nesta execução, para que o mesmo segredo seja usado sempre
// (se mudasse a cada chamada, os tokens emitidos deixariam de ser válidos).
const runtimeSecrets = {};

/*
 * FUNÇÃO: getSecret
 * O que faz: devolve o valor de um segredo (ex.: JWT_SECRET).
 * Parâmetros:
 *   - env (objeto): as variáveis de ambiente (normalmente process.env).
 *   - nodeEnv (string): 'development', 'test' ou 'production'.
 *   - name (string): nome da variável.
 * Retorno (string): o segredo configurado; '' em produção sem segredo (readConfig acusa o erro);
 *   ou um valor aleatório fora de produção.
 */
// Em desenvolvimento e teste, segredos ausentes viram valores aleatórios por processo;
// em produção, a ausência é erro de configuração.
function getSecret(env, nodeEnv, name) {
  // Se a variável existe, usa ela.
  if (env[name]) return env[name];
  // Em produção, devolve vazio (o readConfig vai lançar um erro explicando o problema).
  if (nodeEnv === 'production') return '';

  // Quando o env é o process.env real, gera UMA vez e guarda em runtimeSecrets.
  if (env === process.env) {
    // "||=" atribui só se o valor atual for "falso" (undefined, '', ...).
    // randomBytes(32) = 32 bytes aleatórios; toString('hex') = texto hexadecimal (64 caracteres).
    runtimeSecrets[name] ||= randomBytes(32).toString('hex');
    return runtimeSecrets[name];
  }

  // Com um env "de mentira" (ex.: nos testes), gera um segredo novo a cada chamada.
  return randomBytes(32).toString('hex');
}

/*
 * FUNÇÃO: parseInteger
 * O que faz: converte um valor em número inteiro e confere se está no intervalo permitido.
 * Parâmetros:
 *   - value (string | undefined): valor lido do ambiente.
 *   - fallback (number): valor padrão se "value" não existir.
 *   - name (string): nome da variável (para a mensagem de erro).
 *   - min, max (number): limites aceitos.
 * Retorno (number): o inteiro validado. Lança Error se for inválido.
 */
function parseInteger(value, fallback, name, min, max) {
  // "??" usa o fallback só quando value é null ou undefined. Number() converte texto em número.
  const parsed = Number(value ?? fallback);
  // Precisa ser inteiro e estar entre min e max.
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

/*
 * FUNÇÃO: parseTrustProxy
 * O que faz: interpreta a variável TRUST_PROXY no formato que o Express entende.
 * Parâmetros: value (string | undefined).
 * Retorno: undefined (não configurado), número, true/false ou o próprio texto (lista de redes).
 */
// TRUST_PROXY segue o formato do Express: número de proxies, true/false ou lista de redes.
function parseTrustProxy(value) {
  // Ausente ou vazio: não configura.
  if (value === undefined || value === '') return undefined;
  // Só dígitos (regex ^\d+$): é a quantidade de proxies na frente da API.
  if (/^\d+$/.test(value)) return Number(value);
  // Texto "true"/"false" vira booleano.
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Qualquer outra coisa (ex.: "loopback, 10.0.0.0/8") vai como está.
  return value;
}

/*
 * FUNÇÃO: readEmailConfig
 * O que faz: monta a configuração de envio de e-mails (SMTP).
 * Parâmetros: env (objeto) — variáveis de ambiente.
 * Retorno: objeto congelado { host, port, secure, user, pass, from, replyTo }, ou null se não houver SMTP.
 */
// E-mail (SMTP) é opcional: sem SMTP_HOST a API funciona normalmente e avisa que o e-mail não foi enviado.
function readEmailConfig(env) {
  // Sem servidor SMTP: e-mail desativado.
  if (!env.SMTP_HOST) return null;

  // Porta do SMTP (padrão 587).
  const port = parseInteger(env.SMTP_PORT, 587, 'SMTP_PORT', 1, 65535);
  // Remetente: EMAIL_FROM ou, na falta dele, o usuário do SMTP.
  const from = env.EMAIL_FROM || env.SMTP_USER;
  if (!from) {
    throw new Error('Informe EMAIL_FROM (ou SMTP_USER) quando SMTP_HOST estiver configurada.');
  }
  // Se SMTP_SECURE foi informada, só aceita "true" ou "false".
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) {
    throw new Error('SMTP_SECURE deve ser true ou false.');
  }

  // Object.freeze: impede alterações no objeto depois de criado.
  return Object.freeze({
    host: env.SMTP_HOST,
    port,
    // Conexão segura (TLS) desde o início: o que a variável disser ou, se não informada,
    // só na porta 465 (padrão do SMTP com TLS direto).
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from,
    // Endereço de resposta (opcional).
    replyTo: env.EMAIL_REPLY_TO || '',
  });
}

/*
 * FUNÇÃO: readUrl
 * O que faz: valida uma URL http(s) e devolve "origem + caminho" sem barra no final.
 * Parâmetros: value (string) e name (string, para a mensagem de erro).
 * Retorno (string): ex.: "https://site.org/app". Lança Error se a URL for inválida.
 */
function readUrl(value, name) {
  try {
    // new URL() lança erro se o texto não for uma URL válida.
    const url = new URL(value);
    // Só aceita http e https. "throw new Error()" sem mensagem cai no catch abaixo.
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    // url.origin = "https://site.org"; replace(/\/+$/, '') tira as barras do fim do caminho.
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch (error) {
    // Qualquer problema vira uma mensagem clara com o nome da variável.
    throw new Error(`${name} deve ser uma URL http(s) válida.`);
  }
}

/*
 * FUNÇÃO: readMercadoPagoConfig
 * O que faz: monta a configuração do Mercado Pago (doações online).
 * Parâmetros: env (objeto).
 * Retorno: objeto congelado { accessToken, webhookSecret } ou null (doação online desativada).
 */
// Mercado Pago é opcional: sem o token de acesso, as rotas de doação online respondem 503.
function readMercadoPagoConfig(env) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return null;
  // Com o token, o segredo dos webhooks é obrigatório (para conferir que o aviso veio mesmo do Mercado Pago).
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new Error('Informe MERCADOPAGO_WEBHOOK_SECRET (assinatura secreta dos webhooks) junto com MERCADOPAGO_ACCESS_TOKEN.');
  }
  return Object.freeze({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
  });
}

/*
 * FUNÇÃO: readConfig (exportada)
 * O que faz: lê todas as variáveis, aplica padrões, valida e devolve a configuração completa.
 * Parâmetros:
 *   - env (objeto, opcional): variáveis de ambiente. Padrão: process.env.
 *     Os testes passam um objeto próprio para simular configurações diferentes.
 * Retorno (objeto congelado): nodeEnv, port, requestTimeoutMs, corsOrigins, segredos JWT,
 *   tempos de sessão, trustProxy, email, frontendUrl, apiPublicUrl, uploadDir e mercadoPago.
 *   Lança Error se alguma variável for inválida.
 */
function readConfig(env = process.env) {
  // Ambiente (padrão: desenvolvimento).
  const nodeEnv = env.NODE_ENV || 'development';
  // Porta e tempo limite, convertidos para número.
  const port = Number(env.PORT || DEFAULT_PORT);
  const requestTimeoutMs = Number(env.REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS);
  // Fora de produção, libera o site local (localhost:3000) por padrão; em produção, nenhuma origem.
  const defaultOrigins = nodeEnv === 'production' ? '' : 'http://localhost:3000,http://127.0.0.1:3000';
  // Lista de origens: separa por vírgula, tira espaços e remove itens vazios (filter(Boolean)).
  const corsOrigins = (env.CORS_ORIGIN || defaultOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Segredos para assinar os tokens de acesso e de renovação da sessão.
  const jwtSecret = getSecret(env, nodeEnv, 'JWT_SECRET');
  const refreshTokenSecret = getSecret(env, nodeEnv, 'REFRESH_TOKEN_SECRET');
  // Tempo de inatividade (5 min a 24 h) e duração máxima da sessão (1 h a 7 dias).
  const sessionIdleMinutes = parseInteger(env.SESSION_IDLE_MINUTES, DEFAULT_SESSION_IDLE_MINUTES, 'SESSION_IDLE_MINUTES', 5, 1440);
  const sessionMaxHours = parseInteger(env.SESSION_MAX_HOURS, DEFAULT_SESSION_MAX_HOURS, 'SESSION_MAX_HOURS', 1, 168);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);

  // --- Validações gerais ---
  if (!ALLOWED_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }

  // Porta 0 é aceita (o sistema escolhe uma porta livre; útil em testes).
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT deve ser um número entre 0 e 65535.');
  }

  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000) {
    throw new Error('REQUEST_TIMEOUT_MS deve ser um número inteiro de pelo menos 1000.');
  }

  // Cada origem precisa ser exatamente "protocolo://host[:porta]", sem caminho nem barra no fim.
  for (const origin of corsOrigins) {
    try {
      const parsedOrigin = new URL(origin);
      // parsedOrigin.origin !== origin → havia algo a mais (ex.: "/pagina" ou uma barra final).
      if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
        throw new Error();
      }
    } catch (error) {
      throw new Error('CORS_ORIGIN contém uma origem inválida.');
    }
  }

  // --- Exigências extras em produção ---
  if (nodeEnv === 'production') {
    // Endereço do banco de dados.
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL é obrigatória em produção.');
    }

    // Segredo do token de acesso: pelo menos 32 caracteres (segredos curtos são fáceis de adivinhar).
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET deve conter pelo menos 32 caracteres em produção.');
    }

    // Segredo de renovação: também longo e DIFERENTE do outro (se um vazar, o outro continua seguro).
    if (!refreshTokenSecret || refreshTokenSecret.length < 32 || refreshTokenSecret === jwtSecret) {
      throw new Error('REFRESH_TOKEN_SECRET deve conter pelo menos 32 caracteres e ser diferente de JWT_SECRET em produção.');
    }

    // Em produção, as origens precisam ser informadas explicitamente.
    if (!env.CORS_ORIGIN || corsOrigins.length === 0) {
      throw new Error('CORS_ORIGIN é obrigatória em produção.');
    }

    if (!env.API_PUBLIC_URL) {
      throw new Error('API_PUBLIC_URL é obrigatória em produção (endereço público da API, usado nas URLs das fotos).');
    }
  }

  // Links enviados por e-mail apontam para o site; fotos enviadas são servidas pela própria API.
  // Endereço do site: FRONTEND_URL, ou a primeira origem do CORS, ou o localhost.
  const frontendUrl = readUrl(env.FRONTEND_URL || corsOrigins[0] || 'http://localhost:3000', 'FRONTEND_URL');
  // Endereço público da API (padrão: localhost na porta configurada).
  const apiPublicUrl = readUrl(env.API_PUBLIC_URL || `http://localhost:${port}`, 'API_PUBLIC_URL');
  // Pasta onde as fotos enviadas são gravadas.
  const uploadDir = env.UPLOAD_DIR || 'uploads';

  // Configuração final, congelada.
  return Object.freeze({
    nodeEnv,
    port,
    requestTimeoutMs,
    corsOrigins,
    jwtSecret,
    refreshTokenSecret,
    sessionIdleMinutes,
    sessionMaxHours,
    trustProxy,
    email: readEmailConfig(env),
    frontendUrl,
    apiPublicUrl,
    uploadDir,
    mercadoPago: readMercadoPagoConfig(env),
  });
}

// Só readConfig é exportada; as outras funções são "internas" deste arquivo.
module.exports = { readConfig };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. dotenv carrega o .env em process.env.
 *   2. readConfig() lê cada variável, aplica padrões e converte tipos.
 *   3. Valida formatos (porta, tempos, origens do CORS) e, em produção, exige
 *      banco, segredos fortes e diferentes, CORS e URL pública.
 *   4. Monta as partes opcionais (e-mail e Mercado Pago) e devolve tudo congelado.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Variáveis de ambiente e o pacote dotenv (configuração fora do código).
 *   - "Falhar cedo" (fail fast): validar a configuração ao iniciar.
 *   - Operadores ??, || e ||= para valores padrão.
 *   - Object.freeze, Set, new URL() e expressões regulares simples.
 *   - Segredos: tamanho mínimo, separação entre segredos e geração aleatória.
 * ============================================================================
 */
