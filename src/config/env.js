const { randomBytes } = require('node:crypto');

require('dotenv').config();

const ALLOWED_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const DEFAULT_PORT = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_SESSION_IDLE_MINUTES = 30;
const DEFAULT_SESSION_MAX_HOURS = 12;
const runtimeSecrets = {};

// Em desenvolvimento e teste, segredos ausentes viram valores aleatórios por processo;
// em produção, a ausência é erro de configuração.
function getSecret(env, nodeEnv, name) {
  if (env[name]) return env[name];
  if (nodeEnv === 'production') return '';

  if (env === process.env) {
    runtimeSecrets[name] ||= randomBytes(32).toString('hex');
    return runtimeSecrets[name];
  }

  return randomBytes(32).toString('hex');
}

function parseInteger(value, fallback, name, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return parsed;
}

// TRUST_PROXY segue o formato do Express: número de proxies, true/false ou lista de redes.
function parseTrustProxy(value) {
  if (value === undefined || value === '') return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

// E-mail (SMTP) é opcional: sem SMTP_HOST a API funciona normalmente e avisa que o e-mail não foi enviado.
function readEmailConfig(env) {
  if (!env.SMTP_HOST) return null;

  const port = parseInteger(env.SMTP_PORT, 587, 'SMTP_PORT', 1, 65535);
  const from = env.EMAIL_FROM || env.SMTP_USER;
  if (!from) {
    throw new Error('Informe EMAIL_FROM (ou SMTP_USER) quando SMTP_HOST estiver configurada.');
  }
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) {
    throw new Error('SMTP_SECURE deve ser true ou false.');
  }

  return Object.freeze({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from,
    replyTo: env.EMAIL_REPLY_TO || '',
  });
}

function readUrl(value, name) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch (error) {
    throw new Error(`${name} deve ser uma URL http(s) válida.`);
  }
}

// Mercado Pago é opcional: sem o token de acesso, as rotas de doação online respondem 503.
function readMercadoPagoConfig(env) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return null;
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new Error('Informe MERCADOPAGO_WEBHOOK_SECRET (assinatura secreta dos webhooks) junto com MERCADOPAGO_ACCESS_TOKEN.');
  }
  return Object.freeze({
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
  });
}

function readConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const port = Number(env.PORT || DEFAULT_PORT);
  const requestTimeoutMs = Number(env.REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS);
  const defaultOrigins = nodeEnv === 'production' ? '' : 'http://localhost:3000,http://127.0.0.1:3000';
  const corsOrigins = (env.CORS_ORIGIN || defaultOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const jwtSecret = getSecret(env, nodeEnv, 'JWT_SECRET');
  const refreshTokenSecret = getSecret(env, nodeEnv, 'REFRESH_TOKEN_SECRET');
  const sessionIdleMinutes = parseInteger(env.SESSION_IDLE_MINUTES, DEFAULT_SESSION_IDLE_MINUTES, 'SESSION_IDLE_MINUTES', 5, 1440);
  const sessionMaxHours = parseInteger(env.SESSION_MAX_HOURS, DEFAULT_SESSION_MAX_HOURS, 'SESSION_MAX_HOURS', 1, 168);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);

  if (!ALLOWED_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, test ou production.');
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT deve ser um número entre 0 e 65535.');
  }

  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000) {
    throw new Error('REQUEST_TIMEOUT_MS deve ser um número inteiro de pelo menos 1000.');
  }

  for (const origin of corsOrigins) {
    try {
      const parsedOrigin = new URL(origin);
      if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
        throw new Error();
      }
    } catch (error) {
      throw new Error('CORS_ORIGIN contém uma origem inválida.');
    }
  }

  if (nodeEnv === 'production') {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL é obrigatória em produção.');
    }

    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET deve conter pelo menos 32 caracteres em produção.');
    }

    if (!refreshTokenSecret || refreshTokenSecret.length < 32 || refreshTokenSecret === jwtSecret) {
      throw new Error('REFRESH_TOKEN_SECRET deve conter pelo menos 32 caracteres e ser diferente de JWT_SECRET em produção.');
    }

    if (!env.CORS_ORIGIN || corsOrigins.length === 0) {
      throw new Error('CORS_ORIGIN é obrigatória em produção.');
    }

    if (!env.API_PUBLIC_URL) {
      throw new Error('API_PUBLIC_URL é obrigatória em produção (endereço público da API, usado nas URLs das fotos).');
    }
  }

  // Links enviados por e-mail apontam para o site; fotos enviadas são servidas pela própria API.
  const frontendUrl = readUrl(env.FRONTEND_URL || corsOrigins[0] || 'http://localhost:3000', 'FRONTEND_URL');
  const apiPublicUrl = readUrl(env.API_PUBLIC_URL || `http://localhost:${port}`, 'API_PUBLIC_URL');
  const uploadDir = env.UPLOAD_DIR || 'uploads';

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

module.exports = { readConfig };