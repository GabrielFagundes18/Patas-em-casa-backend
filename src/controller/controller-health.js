const { testConnection } = require('../db/connection-check');

exports.getApiInfo = (req, res) => {
  return res.json({
    ok: true,
    name: 'Patas em Casa API',
    version: '1.0.0',
    mode: process.env.NODE_ENV || 'development',
  });
};

exports.checkHealth = (req, res) => {
  return res.json({
    ok: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};

exports.checkReadiness = async (req, res) => {
  try {
    const status = await testConnection();
    return res.status(status.ok ? 200 : 503).json({
      ok: status.ok,
      status: status.ok ? 'ready' : 'not-ready',
      database: status.mode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      status: 'not-ready',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
};