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

function validateDecision({ body }) {
  const detail = textDetail(body, 'justificativa', {
    min: 10,
    max: 2000,
    required: true,
    message: 'Escreva a justificativa da decisão (mínimo de 10 caracteres).',
  });
  return detail ? [detail] : [];
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
    body.enviar_email === undefined || typeof body.enviar_email === 'boolean'
      ? null
      : { field: 'enviar_email', message: 'Informe true ou false.' },
  ];
  return details.filter(Boolean);
}

module.exports = { validateListRequests, validateBoard, validateUpdateRequest, validateDecision, validateSchedule };
