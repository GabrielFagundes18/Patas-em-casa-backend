const AppError = require('./app-error');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePositiveInteger(value, field, fallback) {
  if (value === undefined || value === '') return fallback;

  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new AppError(400, 'PARAMETRO_INVALIDO', `O parâmetro ${field} deve ser um inteiro positivo.`, [
      { field, message: 'Informe um inteiro maior que zero.' },
    ]);
  }

  return parsedValue;
}

function parsePagination(query = {}) {
  const page = parsePositiveInteger(query.page, 'page', DEFAULT_PAGE);
  const requestedPageSize = parsePositiveInteger(query.pageSize, 'pageSize', DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  if (!Number.isSafeInteger(offset)) {
    throw new AppError(400, 'PARAMETRO_INVALIDO', 'A página solicitada está fora do limite permitido.', [
      { field: 'page', message: 'Informe uma página menor.' },
    ]);
  }

  return { page, pageSize, offset };
}

module.exports = { parsePagination, MAX_PAGE_SIZE };