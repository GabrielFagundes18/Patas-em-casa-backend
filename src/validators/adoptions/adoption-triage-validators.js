const { adoptionRequest } = require('../../config/domain-values');
const { isValidBrasiliaDateTime } = require('../../utils/brasilia-time');
const {
  UUID_PATTERN,
  enumDetail,
  isValidDate,
  listQueryDetails,
  textDetail,
} = require('../common-validators');

const SORT_FIELDS = ['data_pedido', 'atualizado_em', 'status', 'prioridade'];

function validateListRequests({ query }) {
  const details = listQueryDetails(query, SORT_FIELDS);

  if (query.status !== undefined) {
    const statuses = String(query.status).split(',');
    if (statuses.some((status) => !adoptionRequest.status.includes(status))) {
      details.push({ field: 'status', message: `Use um ou mais status separados por vírgula: ${adoptionRequest.status.join(', ')}.` });
    }
  }

  const priority = enumDetail(query.prioridade, 'prioridade', adoptionRequest.priority);
  if (priority) details.push(priority);

  if (query.responsavel_id !== undefined && query.responsavel_id !== 'nenhum' && !UUID_PATTERN.test(query.responsavel_id)) {
    details.push({ field: 'responsavel_id', message: 'Informe um identificador válido ou "nenhum".' });
  }
  for (const field of ['animal_id', 'adotante_id']) {
    if (query[field] !== undefined && !UUID_PATTERN.test(query[field])) {
      details.push({ field, message: 'Informe um identificador válido.' });
    }
  }
  for (const field of ['de', 'ate']) {
    if (query[field] !== undefined && !isValidDate(query[field])) {
      details.push({ field, message: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
  }
  if (isValidDate(query.de) && isValidDate(query.ate) && query.de > query.ate) {
    details.push({ field: 'ate', message: 'A data final deve ser igual ou posterior à inicial.' });
  }

  return details;
}

function validateBoard({ query }) {
  return query.incluir_reprovados === undefined || ['true', 'false'].includes(query.incluir_reprovados)
    ? []
    : [{ field: 'incluir_reprovados', message: 'Informe true ou false.' }];
}

function validateUpdateRequest({ body }) {
  if (!['status', 'prioridade', 'responsavel_id', 'nota'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe status, prioridade, responsável ou uma anotação.' }];
  }

  const details = [];
  if (body.status !== undefined && !adoptionRequest.openStatus.includes(body.status)) {
    details.push({
      field: 'status',
      message: `Use ${adoptionRequest.openStatus.join(', ')}. Para aprovar ou reprovar, use as ações de decisão.`,
    });
  }

  const priority = enumDetail(body.prioridade, 'prioridade', adoptionRequest.priority);
  if (priority) details.push(priority);

  if (Object.hasOwn(body, 'responsavel_id') && body.responsavel_id !== null
    && (typeof body.responsavel_id !== 'string' || !UUID_PATTERN.test(body.responsavel_id))) {
    details.push({ field: 'responsavel_id', message: 'Informe um identificador válido ou null para remover o responsável.' });
  }

  const note = textDetail(body, 'nota', { min: 1, max: 2000, message: 'Escreva a anotação (até 2000 caracteres).' });
  if (note) details.push(note);

  return details;
}

function booleanDetail(body, field) {
  return body[field] === undefined || typeof body[field] === 'boolean' ? null : { field, message: 'Informe true ou false.' };
}

function validateDecision({ body }) {
  return [
    textDetail(body, 'justificativa', {
      min: 10,
      max: 2000,
      required: true,
      message: 'Escreva a justificativa da decisão (mínimo de 10 caracteres).',
    }),
    booleanDetail(body, 'notificar_adotante'),
    textDetail(body, 'mensagem_adotante', { min: 0, max: 1000, message: 'Escreva a mensagem ao adotante (até 1000 caracteres).' }),
  ].filter(Boolean);
}

function durationDetail(body) {
  if (body.duracao_minutos === undefined) return null;
  return Number.isInteger(body.duracao_minutos) && body.duracao_minutos >= 15 && body.duracao_minutos <= 480
    ? null
    : { field: 'duracao_minutos', message: 'Informe a duração em minutos, de 15 a 480.' };
}

function validateSchedule({ body }) {
  const details = [
    body.tipo === undefined
      ? { field: 'tipo', message: 'Escolha visita ou entrevista.' }
      : enumDetail(body.tipo, 'tipo', adoptionRequest.appointmentTypes),
    isValidBrasiliaDateTime(body.data_hora)
      ? null
      : { field: 'data_hora', message: 'Informe data e horário no formato AAAA-MM-DDTHH:mm.' },
    textDetail(body, 'local', { min: 0, max: 300, message: 'Informe o local ou link (até 300 caracteres).' }),
    textDetail(body, 'mensagem', { min: 0, max: 1000, message: 'Escreva a mensagem (até 1000 caracteres).' }),
    booleanDetail(body, 'enviar_email'),
    durationDetail(body),
    body.responsavel_id === undefined || body.responsavel_id === null
      || (typeof body.responsavel_id === 'string' && UUID_PATTERN.test(body.responsavel_id))
      ? null
      : { field: 'responsavel_id', message: 'Informe um identificador válido.' },
  ];
  return details.filter(Boolean);
}

function validateAppointmentParams({ params }) {
  return [params.id, params.appointmentId].every((value) => UUID_PATTERN.test(value))
    ? []
    : [{ field: 'id', message: 'Informe identificadores válidos.' }];
}

function validateReschedule({ body }) {
  return [
    isValidBrasiliaDateTime(body.data_hora)
      ? null
      : { field: 'data_hora', message: 'Informe data e horário no formato AAAA-MM-DDTHH:mm.' },
    durationDetail(body),
    textDetail(body, 'local', { min: 0, max: 300, message: 'Informe o local ou link (até 300 caracteres).' }),
    textDetail(body, 'mensagem', { min: 0, max: 1000, message: 'Escreva a mensagem (até 1000 caracteres).' }),
    booleanDetail(body, 'enviar_email'),
  ].filter(Boolean);
}

function validateCancelAppointment({ body }) {
  return [
    textDetail(body, 'motivo', { min: 0, max: 500, message: 'Escreva o motivo (até 500 caracteres).' }),
    booleanDetail(body, 'enviar_email'),
  ].filter(Boolean);
}

module.exports = {
  validateListRequests,
  validateBoard,
  validateUpdateRequest,
  validateDecision,
  validateSchedule,
  validateAppointmentParams,
  validateReschedule,
  validateCancelAppointment,
};
