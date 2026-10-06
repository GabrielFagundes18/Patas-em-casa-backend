// Somente identificadores técnicos entram no log; nenhum dado pessoal (LGPD).
const ALLOWED_CONTEXT_KEYS = new Set([
  'requestId',
  'method',
  'statusCode',
  'durationMs',
  'code',
  'userId',
  'action',
  'module',
  'entity',
  'entityId',
  'port',
  'signal',
]);

function write(level, event, context = {}) {
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([key, value]) =>
      ALLOWED_CONTEXT_KEYS.has(key) && ['string', 'number'].includes(typeof value)
    )
  );

  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeContext,
  })}\n`);
}

module.exports = {
  info: (event, context) => write('info', event, context),
  error: (event, context) => write('error', event, context),
};