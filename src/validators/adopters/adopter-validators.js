const { adopter } = require('../../config/domain-values');
const {
  EMAIL_PATTERN,
  enumDetail,
  listQueryDetails,
  textDetail,
} = require('../common-validators');

const SORT_FIELDS = ['nome', 'criado_em', 'cidade', 'status'];
const STATE_PATTERN = /^[A-Z]{2}$/;
const PHONE_PATTERN = /^[0-9()+\-\s]+$/;

function validateListAdopters({ query }) {
  const details = listQueryDetails(query, SORT_FIELDS);
  const status = enumDetail(query.status, 'status', adopter.status);
  if (status) details.push(status);
  if (query.estado !== undefined && !STATE_PATTERN.test(query.estado)) {
    details.push({ field: 'estado', message: 'Use a sigla do estado com duas letras maiúsculas (ex.: SP).' });
  }
  if (query.cidade !== undefined && (typeof query.cidade !== 'string' || query.cidade.length > 100)) {
    details.push({ field: 'cidade', message: 'A cidade deve ter no máximo 100 caracteres.' });
  }
  return details;
}

function validateUpdateAdopter({ body }) {
  const fields = ['nome', 'email', 'telefone', 'cidade', 'estado', 'endereco', 'status'];
  if (!fields.some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }

  const details = [
    textDetail(body, 'nome', { min: 2, max: 150, message: 'Informe o nome completo.' }),
    textDetail(body, 'cidade', { min: 2, max: 100, message: 'Informe a cidade.' }),
    textDetail(body, 'endereco', { min: 5, max: 500, message: 'Informe o endereço completo.' }),
    enumDetail(body.status, 'status', adopter.status),
  ].filter(Boolean);

  if (Object.hasOwn(body, 'email')
    && (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim()) || body.email.trim().length > 150)) {
    details.push({ field: 'email', message: 'Informe um e-mail válido.' });
  }
  if (Object.hasOwn(body, 'telefone') && body.telefone !== null) {
    const digits = typeof body.telefone === 'string' ? body.telefone.replace(/\D/g, '') : '';
    if (typeof body.telefone !== 'string' || !PHONE_PATTERN.test(body.telefone) || body.telefone.length > 20
      || digits.length < 10 || digits.length > 13) {
      details.push({ field: 'telefone', message: 'Informe um telefone com DDD.' });
    }
  }
  if (Object.hasOwn(body, 'estado') && body.estado !== null && !STATE_PATTERN.test(body.estado)) {
    details.push({ field: 'estado', message: 'Use a sigla do estado com duas letras maiúsculas (ex.: SP).' });
  }

  return details;
}

// Ações irreversíveis da LGPD exigem que a palavra de confirmação seja digitada.
function validateConfirmation(expected) {
  return function validateConfirmationWord({ body }) {
    return body.confirmacao === expected
      ? []
      : [{ field: 'confirmacao', message: `Digite ${expected} para confirmar. Esta ação não pode ser desfeita.` }];
  };
}

module.exports = { validateListAdopters, validateUpdateAdopter, validateConfirmation };
