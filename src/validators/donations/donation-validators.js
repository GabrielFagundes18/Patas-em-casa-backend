const { donation } = require('../../config/domain-values');
const {
  EMAIL_PATTERN,
  UUID_PATTERN,
  enumDetail,
  isValidDate,
  listQueryDetails,
  textDetail,
} = require('../common-validators');

const SORT_FIELDS = ['data', 'valor', 'doador_nome', 'status'];
const MAX_VALUE = 99999999.99;

function periodDetails(source) {
  const details = [];
  for (const field of ['de', 'ate']) {
    if (source[field] !== undefined && !isValidDate(source[field])) {
      details.push({ field, message: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
  }
  if (isValidDate(source.de) && isValidDate(source.ate) && source.de > source.ate) {
    details.push({ field: 'ate', message: 'A data final deve ser igual ou posterior à inicial.' });
  }
  return details;
}

function validateListDonations({ query }) {
  const details = [...listQueryDetails(query, SORT_FIELDS), ...periodDetails(query)];
  for (const [field, values] of [['tipo', donation.type], ['metodo', donation.method], ['status', donation.status]]) {
    const detail = enumDetail(query[field], field, values);
    if (detail) details.push(detail);
  }
  if (query.adotante_id !== undefined && !UUID_PATTERN.test(query.adotante_id)) {
    details.push({ field: 'adotante_id', message: 'Informe um identificador válido.' });
  }
  return details;
}

function validateSummary({ query }) {
  return periodDetails(query);
}

function validateMonthly({ query }) {
  if (query.meses === undefined) return [];
  const months = Number(query.meses);
  return Number.isInteger(months) && months >= 1 && months <= 36
    ? []
    : [{ field: 'meses', message: 'Informe um número de meses entre 1 e 36.' }];
}

function donationPayloadDetails(body, partial) {
  const details = [
    textDetail(body, 'doador_nome', { min: 2, max: 150, required: !partial, message: 'Informe o nome do doador.' }),
    enumDetail(body.tipo, 'tipo', donation.type),
    enumDetail(body.status, 'status', donation.status),
  ].filter(Boolean);

  if (!partial && body.tipo === undefined) details.push({ field: 'tipo', message: 'Informe o tipo da doação (unica ou recorrente).' });
  if (body.metodo !== undefined && body.metodo !== null) {
    const method = enumDetail(body.metodo, 'metodo', donation.method);
    if (method) details.push(method);
  }

  if (!partial || Object.hasOwn(body, 'valor')) {
    const value = Number(body.valor);
    const hasTwoDecimals = Number.isFinite(value) && Math.round(value * 100) === Number((value * 100).toFixed(4));
    if (typeof body.valor !== 'number' && typeof body.valor !== 'string') {
      details.push({ field: 'valor', message: 'Informe o valor da doação.' });
    } else if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE || !hasTwoDecimals) {
      details.push({ field: 'valor', message: 'Informe um valor maior que zero, com até duas casas decimais.' });
    }
  }

  if (Object.hasOwn(body, 'doador_email') && body.doador_email !== null && body.doador_email !== ''
    && (typeof body.doador_email !== 'string' || !EMAIL_PATTERN.test(body.doador_email.trim()) || body.doador_email.length > 150)) {
    details.push({ field: 'doador_email', message: 'Informe um e-mail válido ou deixe em branco.' });
  }
  if (Object.hasOwn(body, 'adotante_id') && body.adotante_id !== null && body.adotante_id !== ''
    && (typeof body.adotante_id !== 'string' || !UUID_PATTERN.test(body.adotante_id))) {
    details.push({ field: 'adotante_id', message: 'Informe um identificador válido ou deixe em branco.' });
  }
  if (Object.hasOwn(body, 'data') && body.data !== null) {
    const date = typeof body.data === 'string' ? new Date(body.data) : null;
    if (!date || Number.isNaN(date.valueOf()) || date.getTime() > Date.now() + 60000) {
      details.push({ field: 'data', message: 'Informe uma data válida (ISO 8601) que não esteja no futuro.' });
    }
  }

  return details;
}

function validateCreateDonation({ body }) {
  return donationPayloadDetails(body, false);
}

function validateUpdateDonation({ body }) {
  const fields = ['adotante_id', 'doador_nome', 'doador_email', 'tipo', 'valor', 'metodo', 'status', 'data'];
  if (!fields.some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return donationPayloadDetails(body, true);
}

module.exports = {
  validateListDonations,
  validateSummary,
  validateMonthly,
  validateCreateDonation,
  validateUpdateDonation,
};
