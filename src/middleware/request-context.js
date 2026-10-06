const { randomUUID } = require('node:crypto');
const logger = require('../utils/logger');

function requestContext(req, res, next) {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('http_request', {
      requestId,
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  return next();
}

module.exports = requestContext;