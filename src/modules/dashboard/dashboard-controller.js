const dashboardService = require('./dashboard-service');
const { successResponse } = require('../../utils/http-response');

exports.summary = async (req, res) => {
  return res.json(successResponse(await dashboardService.summary({ fresh: req.query.atualizar === 'true' })));
};
