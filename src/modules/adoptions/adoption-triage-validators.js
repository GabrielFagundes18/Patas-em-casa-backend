/*
 * ============================================================================
 * ARQUIVO: adoption-triage-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES da TRIAGEM DE PEDIDOS no painel: filtros da lista e do quadro,
 *   edição do pedido, decisão (aprovar/reprovar), agendamento, remarcação,
 *   cancelamento de compromisso e ids da URL.
 *
 * PRINCIPAIS ITENS:
 *   - SORT_FIELDS.
 *   - validateListRequests, validateBoard, validateUpdateRequest, validateDecision,
 *     validateSchedule, validateAppointmentParams, validateReschedule,
 *     validateCancelAppointment (exportadas).
 *   - booleanDetail, durationDetail (internas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values, utils/brasilia-time, utils/validators.
 *   - Usado por: ./adoption-request-routes.js.
 * ============================================================================
 */

// Valores de status, prioridade e tipos de agendamento.
const { adoptionRequest } = require('../../config/domain-values');
// Validação de data/hora de Brasília.
const { isValidBrasiliaDateTime } = require('../../utils/brasilia-time');
// Validações reutilizáveis.
const {
  UUID_PATTERN,
  enumDetail,
  isValidDate,
  listQueryDetails,
  textDetail,
} = require('../../utils/validators');

// Campos permitidos para ordenação.
const SORT_FIELDS = ['data_pedido', 'atualizado_em', 'status', 'prioridade'];

/*
 * FUNÇÃO: validateListRequests
 * O que faz: valida os filtros da lista de pedidos.
 */
function validateListRequests({ query }) {
  // Paginação, busca e ordenação.
  const details = listQueryDetails(query, SORT_FIELDS);

  // Status: um ou vários separados por vírgula (ex.: "novo,em_analise").
  if (query.status !== undefined) {
    const statuses = String(query.status).split(',');
    if (statuses.some((status) => !adoptionRequest.status.includes(status))) {
      details.push({ field: 'status', message: `Use um ou mais status separados por vírgula: ${adoptionRequest.status.join(', ')}.` });
    }
  }

  // Prioridade.
  const priority = enumDetail(query.prioridade, 'prioridade', adoptionRequest.priority);
  if (priority) details.push(priority);

  // Responsável: UUID ou a palavra "nenhum" (pedidos sem responsável).
  if (query.responsavel_id !== undefined && query.responsavel_id !== 'nenhum' && !UUID_PATTERN.test(query.responsavel_id)) {
    details.push({ field: 'responsavel_id', message: 'Informe um identificador válido ou "nenhum".' });
  }
  // Animal e adotante: UUID.
  for (const field of ['animal_id', 'adotante_id']) {
    if (query[field] !== undefined && !UUID_PATTERN.test(query[field])) {
      details.push({ field, message: 'Informe um identificador válido.' });
    }
  }
  // Período: datas válidas.
  for (const field of ['de', 'ate']) {
    if (query[field] !== undefined && !isValidDate(query[field])) {
      details.push({ field, message: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
  }
  // "de" não pode ser depois de "ate". Datas AAAA-MM-DD podem ser comparadas como texto.
  if (isValidDate(query.de) && isValidDate(query.ate) && query.de > query.ate) {
    details.push({ field: 'ate', message: 'A data final deve ser igual ou posterior à inicial.' });
  }

  return details;
}

/*
 * FUNÇÃO: validateBoard
 * O que faz: incluir_reprovados (opcional) só aceita "true" ou "false".
 */
function validateBoard({ query }) {
  return query.incluir_reprovados === undefined || ['true', 'false'].includes(query.incluir_reprovados)
    ? []
    : [{ field: 'incluir_reprovados', message: 'Informe true ou false.' }];
}

/*
 * FUNÇÃO: validateUpdateRequest
 * O que faz: valida a edição do pedido (status de triagem, prioridade, responsável, anotação).
 */
function validateUpdateRequest({ body }) {
  // Pelo menos um destes campos.
  if (!['status', 'prioridade', 'responsavel_id', 'nota'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe status, prioridade, responsável ou uma anotação.' }];
  }

  const details = [];
  // Aqui só se muda entre etapas em aberto; aprovar/reprovar têm rotas próprias.
  if (body.status !== undefined && !adoptionRequest.openStatus.includes(body.status)) {
    details.push({
      field: 'status',
      message: `Use ${adoptionRequest.openStatus.join(', ')}. Para aprovar ou reprovar, use as ações de decisão.`,
    });
  }

  const priority = enumDetail(body.prioridade, 'prioridade', adoptionRequest.priority);
  if (priority) details.push(priority);

  // Responsável: UUID ou null (para remover).
  if (Object.hasOwn(body, 'responsavel_id') && body.responsavel_id !== null
    && (typeof body.responsavel_id !== 'string' || !UUID_PATTERN.test(body.responsavel_id))) {
    details.push({ field: 'responsavel_id', message: 'Informe um identificador válido ou null para remover o responsável.' });
  }

  // Anotação: até 2000 caracteres.
  const note = textDetail(body, 'nota', { min: 1, max: 2000, message: 'Escreva a anotação (até 2000 caracteres).' });
  if (note) details.push(note);

  return details;
}

/*
 * FUNÇÃO: booleanDetail (interna)
 * O que faz: campo opcional que, se enviado, precisa ser true/false.
 */
function booleanDetail(body, field) {
  return body[field] === undefined || typeof body[field] === 'boolean' ? null : { field, message: 'Informe true ou false.' };
}

/*
 * FUNÇÃO: validateDecision
 * O que faz: valida aprovar/reprovar: justificativa obrigatória (10 a 2000), notificar_adotante
 *   (booleano opcional) e mensagem ao adotante (opcional, até 1000).
 */
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

/*
 * FUNÇÃO: durationDetail (interna)
 * O que faz: duração opcional, inteira, de 15 a 480 minutos (8 horas).
 */
function durationDetail(body) {
  if (body.duracao_minutos === undefined) return null;
  return Number.isInteger(body.duracao_minutos) && body.duracao_minutos >= 15 && body.duracao_minutos <= 480
    ? null
    : { field: 'duracao_minutos', message: 'Informe a duração em minutos, de 15 a 480.' };
}

/*
 * FUNÇÃO: validateSchedule
 * O que faz: valida um agendamento novo (tipo, data/hora, local, mensagem, enviar_email,
 *   duração e responsável).
 */
function validateSchedule({ body }) {
  const details = [
    // Tipo obrigatório e válido.
    body.tipo === undefined
      ? { field: 'tipo', message: 'Escolha visita ou entrevista.' }
      : enumDetail(body.tipo, 'tipo', adoptionRequest.appointmentTypes),
    // Data/hora no formato do campo datetime-local.
    isValidBrasiliaDateTime(body.data_hora)
      ? null
      : { field: 'data_hora', message: 'Informe data e horário no formato AAAA-MM-DDTHH:mm.' },
    textDetail(body, 'local', { min: 0, max: 300, message: 'Informe o local ou link (até 300 caracteres).' }),
    textDetail(body, 'mensagem', { min: 0, max: 1000, message: 'Escreva a mensagem (até 1000 caracteres).' }),
    booleanDetail(body, 'enviar_email'),
    durationDetail(body),
    // Responsável: ausente, null ou UUID. (O "?:" vale para toda a condição com "||" antes dele.)
    body.responsavel_id === undefined || body.responsavel_id === null
      || (typeof body.responsavel_id === 'string' && UUID_PATTERN.test(body.responsavel_id))
      ? null
      : { field: 'responsavel_id', message: 'Informe um identificador válido.' },
  ];
  return details.filter(Boolean);
}

/*
 * FUNÇÃO: validateAppointmentParams
 * O que faz: :id (pedido) e :appointmentId (compromisso) precisam ser UUIDs.
 */
function validateAppointmentParams({ params }) {
  return [params.id, params.appointmentId].every((value) => UUID_PATTERN.test(value))
    ? []
    : [{ field: 'id', message: 'Informe identificadores válidos.' }];
}

/*
 * FUNÇÃO: validateReschedule
 * O que faz: valida a remarcação (nova data/hora obrigatória; demais campos opcionais).
 */
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

/*
 * FUNÇÃO: validateCancelAppointment
 * O que faz: valida o cancelamento (motivo opcional até 500; enviar_email opcional).
 */
function validateCancelAppointment({ body }) {
  return [
    textDetail(body, 'motivo', { min: 0, max: 500, message: 'Escreva o motivo (até 500 caracteres).' }),
    booleanDetail(body, 'enviar_email'),
  ].filter(Boolean);
}

// Exporta os validadores.
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

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada rota da triagem usa o validador correspondente. Muitos validadores
 *   montam um array de "detalhe ou null" e limpam com filter(Boolean). Com
 *   detalhes, a API responde 422 antes do service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Precedência de operadores: "||" é avaliado antes do ternário "? :".
 *   - Comparar datas AAAA-MM-DD como texto (a ordem alfabética coincide com a cronológica).
 *   - Separar edição comum de ações de decisão (rotas e validações diferentes).
 * ============================================================================
 */
