const AppError = require('../utils/app-error');

function validateRequest(validator) {
  return (req, res, next) => {
    try {
      const details = validator({
        body: req.body || {},
        params: req.params,
        query: req.query,
      });

      if (details.length > 0) {
        return next(new AppError(
          422,
          'VALIDACAO_INVALIDA',
          'Verifique os campos informados.',
          details
        ));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = validateRequest;