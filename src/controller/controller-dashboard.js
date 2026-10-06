const dashboardService = require('../services/dashboard/dashboard-service');
const { successResponse } = require('../utils/http-response');

exports.summary = async (req, res, next) => {
  try {
    return res.json(successResponse(await dashboardService.summary({ fresh: req.query.atualizar === 'true' })));
  } catch (error) {
    return next(error);
  }
};
