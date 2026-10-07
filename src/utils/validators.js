const { parsePagination } = require('./pagination');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9()+\-\s]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function enumDetail(value, field, values) {
  if (value === undefined) return null;
  return values.includes(value)
    ? null
    : { field, message: `Valor inválido. Opções permitidas: ${values.join(', ')}.` };
}

function validateIdParam({ params }) {
  return UUID_PATTERN.test(params.id) ? [] : [{ field: 'id', message: 'Informe um identificador válido.' }];
}

// Paginação, busca textual e ordenação comuns às listagens.
function listQueryDetails(query, sortFields) {
  const details = [];

  try {
    parsePagination(query);
  } catch (error) {
    details.push(...(error.details || []));
  }

  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 120)) {
    details.push({ field: 'q', message: 'A busca deve ter no máximo 120 caracteres.' });
  }
  if (query.sort !== undefined && !sortFields.includes(query.sort)) {
    details.push({ field: 'sort', message: `Campo de ordenação não permitido. Use: ${sortFields.join(', ')}.` });
  }
  if (query.order !== undefined && (typeof query.order !== 'string' || !['asc', 'desc'].includes(query.order.toLowerCase()))) {
    details.push({ field: 'order', message: 'Use asc ou desc para a ordenação.' });
  }

  return details;
}

function emailDetail(body, required) {
  if (!Object.hasOwn(body, 'email')) {
    return required ? { field: 'email', message: 'Informe um e-mail válido.' } : null;
  }
  return typeof body.email === 'string' && EMAIL_PATTERN.test(body.email.trim()) && body.email.trim().length <= 150
    ? null
    : { field: 'email', message: 'Informe um e-mail válido.' };
}

function textDetail(body, field, { min = 1, max, required = false, message }) {
  if (!Object.hasOwn(body, field) || body[field] === null) {
    return required ? { field, message } : null;
  }
  if (typeof body[field] !== 'string') return { field, message };
  const length = body[field].trim().length;
  if (length < min) return { field, message };
  if (max && length > max) return { field, message: `Use no máximo ${max} caracteres.` };
  return null;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

module.exports = {
  UUID_PATTERN,
  EMAIL_PATTERN,
  PHONE_PATTERN,
  emailDetail,
  enumDetail,
  validateIdParam,
  listQueryDetails,
  textDetail,
  isValidDate,
};
