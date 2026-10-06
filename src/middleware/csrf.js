const AppError = require('../utils/app-error');

// Rotas que leem o cookie de sessão exigem um cabeçalho que formulários de outros sites não
// conseguem enviar; requisições de outras origens com ele passam pelo CORS, que só aceita
// as origens configuradas. Junto com SameSite=Strict, isso bloqueia CSRF.
function requireAjaxHeader(req, res, next) {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return next(new AppError(403, 'CSRF_INVALIDO', 'Requisição recusada por segurança. Atualize a página e tente novamente.'));
  }
  return next();
}

module.exports = requireAjaxHeader;
