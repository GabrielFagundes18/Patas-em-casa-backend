/*
 * ============================================================================
 * ARQUIVO: volunteer-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES dos VOLUNTÁRIOS: filtros da lista, cadastro/edição no painel e
 *   a inscrição pública pelo site (com campo anti-robô).
 *
 * PRINCIPAIS ITENS:
 *   - SORT_FIELDS.
 *   - phoneDetail, areasDetail, volunteerDetails (internas).
 *   - validateListVolunteers, validateCreateVolunteer, validateUpdateVolunteer,
 *     validateVolunteerApplication (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values (status e áreas) e utils/validators.
 *   - Usado por: ./volunteer-routes.js e modules/public/public-routes.js.
 * ============================================================================
 */

// Status e áreas aceitos.
const { volunteer } = require('../../config/domain-values');
// Validações reutilizáveis.
const {
  PHONE_PATTERN,
  emailDetail,
  enumDetail,
  isValidDate,
  listQueryDetails,
  textDetail,
} = require('../../utils/validators');

// Ordenações permitidas.
const SORT_FIELDS = ['nome', 'criado_em', 'data_inicio', 'status'];

/*
 * FUNÇÃO: phoneDetail (interna)
 * O que faz: telefone (obrigatório ou não): caracteres permitidos, até 20 caracteres e 10 a 13 dígitos.
 */
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

/*
 * FUNÇÃO: areasDetail (interna)
 * O que faz: áreas precisam ser um array de valores válidos (e não vazio, se obrigatório).
 */
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

/*
 * FUNÇÃO: validateListVolunteers
 * O que faz: paginação/busca/ordenação, status e área.
 */
function validateListVolunteers({ query }) {
  const details = listQueryDetails(query, SORT_FIELDS);
  for (const [field, values] of [['status', volunteer.status], ['area', volunteer.areas]]) {
    const detail = enumDetail(query[field], field, values);
    if (detail) details.push(detail);
  }
  return details;
}

/*
 * FUNÇÃO: volunteerDetails (interna)
 * O que faz: valida o corpo do painel (partial = true na edição).
 */
function volunteerDetails(body, partial) {
  const details = [
    textDetail(body, 'nome', { min: 2, max: 150, required: !partial, message: 'Informe o nome completo.' }),
    emailDetail(body, !partial),
    phoneDetail(body, false),
    enumDetail(body.status, 'status', volunteer.status),
    areasDetail(body, false),
  ].filter(Boolean);

  // Data de início opcional (null permitido).
  if (Object.hasOwn(body, 'data_inicio') && body.data_inicio !== null && !isValidDate(body.data_inicio)) {
    details.push({ field: 'data_inicio', message: 'Informe uma data válida no formato AAAA-MM-DD.' });
  }
  return details;
}

/*
 * FUNÇÃO: validateCreateVolunteer — cadastro pelo painel (nome e e-mail obrigatórios).
 */
function validateCreateVolunteer({ body }) {
  return volunteerDetails(body, false);
}

/*
 * FUNÇÃO: validateUpdateVolunteer — edição (ao menos um campo).
 */
function validateUpdateVolunteer({ body }) {
  if (!['nome', 'email', 'telefone', 'status', 'data_inicio', 'areas'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return volunteerDetails(body, true);
}

/*
 * FUNÇÃO: validateVolunteerApplication — inscrição pelo site: nome, e-mail, telefone e ao menos
 * uma área obrigatórios, mais o honeypot.
 */
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

// Exporta os validadores.
module.exports = {
  validateListVolunteers,
  validateCreateVolunteer,
  validateUpdateVolunteer,
  validateVolunteerApplication,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Painel e site usam validadores diferentes: o do site exige mais campos e
 *   tem o honeypot. Detalhes → 422.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validar arrays (Array.isArray + some).
 *   - Validadores diferentes para o mesmo recurso conforme quem envia.
 * ============================================================================
 */
