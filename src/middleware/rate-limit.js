const AppError = require('../utils/app-error');

// Limite de requisições por janela fixa, em memória (uma instância da API).
// Atrás de proxy, configure TRUST_PROXY para que req.ip seja o IP real do cliente.
function rateLimit({ windowMs, max, keyFn = (req) => req.ip || 'desconhecido' }) {
  const hits = new Map();
  let lastSweep = Date.now();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();

    if (now - lastSweep > windowMs) {
      for (const [key, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(key);
      }
      lastSweep = now;
    }

    const key = keyFn(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError(429, 'MUITAS_REQUISICOES', 'Muitas solicitações em pouco tempo. Tente novamente mais tarde.'));
    }

    return next();
  };
}

module.exports = rateLimit;
