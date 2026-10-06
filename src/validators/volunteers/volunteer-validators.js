const { volunteer } = require('../../config/domain-values');
const {
  PHONE_PATTERN,
  emailDetail,
  enumDetail,
  isValidDate,
  listQueryDetails,
  textDetail,
} = require('../common-validators');

const SORT_FIELDS = ['nome', 'criado_em', 'data_inicio', 'status'];

function phoneDetail(body, required) {
  if (!Object.hasOwn(body, 'telefone') || body.telefone === null || body.telefone === '') {
    return required ? { field: 'telefone', message: 'Informe um telefone com DDD.' } : null;
  }
  const digits = typeof body.telefone === 'string' ? body.telefone.replace(/\D/g, '') : '';
  return typeof body.telefone === 'string' && PHONE_PATTERN.test(body.telefone) && body.telefone.length <= 20
    && digits.length >= 10 && digits.length <= 13
    ? null
    : { field: 'telefone', message: 'Informe um telefone com DDD.' };
}

function areasDetail(body, required) {
  if (!Object.hasOwn(body, 'areas')) {
    return required ? { field: 'areas', message: 'Escolha ao menos uma área de interesse.' } : null;
  }
  if (!Array.isArray(body.areas) || (required && body.areas.length === 0)
    || body.areas.some((area) => !volunteer.areas.includes(area))) {
    return { field: 'areas', message: `Escolha áreas válidas: ${volunteer.areas.join(', ')}.` };
  }
  return null;
}

function validateListVolunteers({ query }) {
  const details = listQueryDetails(query, SORT_FIELDS);
  for (const [field, values] of [['status', volunteer.status], ['area', volunteer.areas]]) {
    const detail = enumDetail(query[field], field, values);
    if (detail) details.push(detail);
  }
  return details;
}

function volunteerDetails(body, partial) {
  const details = [
    textDetail(body, 'nome', { min: 2, max: 150, required: !partial, message: 'Informe o nome completo.' }),
    emailDetail(body, !partial),
    phoneDetail(body, false),
    enumDetail(body.status, 'status', volunteer.status),
    areasDetail(body, false),
  ].filter(Boolean);

  if (Object.hasOwn(body, 'data_inicio') && body.data_inicio !== null && !isValidDate(body.data_inicio)) {
    details.push({ field: 'data_inicio', message: 'Informe uma data válida no formato AAAA-MM-DD.' });
  }
  return details;
}

function validateCreateVolunteer({ body }) {
  return volunteerDetails(body, false);
}

function validateUpdateVolunteer({ body }) {
  if (!['nome', 'email', 'telefone', 'status', 'data_inicio', 'areas'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return volunteerDetails(body, true);
}

// Inscrição pública: o campo "website" fica escondido no formulário; robôs o preenchem.
function validateVolunteerApplication({ body }) {
  return [
    textDetail(body, 'nome', { min: 2, max: 150, required: true, message: 'Informe seu nome completo.' }),
    emailDetail(body, true),
    phoneDetail(body, true),
    areasDetail(body, true),
    body.website ? { field: 'website', message: 'Não foi possível enviar a inscrição.' } : null,
  ].filter(Boolean);
}

module.exports = {
  validateListVolunteers,
  validateCreateVolunteer,
  validateUpdateVolunteer,
  validateVolunteerApplication,
};
