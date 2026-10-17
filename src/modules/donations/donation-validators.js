/*
 * ============================================================================
 * ARQUIVO: donation-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES das DOAÇÕES do painel: filtros da lista, período do resumo,
 *   quantidade de meses da série e dados de cadastro/edição (nome, tipo,
 *   status, forma de pagamento, valor com até 2 casas, e-mail, adotante, data).
 *
 * PRINCIPAIS ITENS:
 *   - SORT_FIELDS, MAX_VALUE.
 *   - periodDetails, donationPayloadDetails (internas).
 *   - validateListDonations, validateSummary, validateMonthly,
 *     validateCreateDonation, validateUpdateDonation (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values (donation), utils/validators.
 *   - Usado por: ./donation-routes.js.
 * ============================================================================
 */

// Valores aceitos (tipo, forma de pagamento, status).
const { donation } = require('../../config/domain-values');
// Validações reutilizáveis.
const {
  EMAIL_PATTERN,
  UUID_PATTERN,
  enumDetail,
  isValidDate,
  listQueryDetails,
  textDetail,
} = require('../../utils/validators');

// Ordenações permitidas.
const SORT_FIELDS = ['data', 'valor', 'doador_nome', 'status'];
// Maior valor aceito (cabe na coluna numeric do banco).
const MAX_VALUE = 99999999.99;

/*
 * FUNÇÃO: periodDetails (interna)
 * O que faz: valida "de" e "ate" (datas válidas e na ordem certa).
 * Parâmetros: source (objeto com de/ate — normalmente req.query).
 */
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

/*
 * FUNÇÃO: validateListDonations
 * O que faz: valida os filtros da lista (e da exportação).
 */
function validateListDonations({ query }) {
  // Junta os detalhes comuns de lista e os do período.
  const details = [...listQueryDetails(query, SORT_FIELDS), ...periodDetails(query)];
  // Filtros de escolha: pares [campo, valores aceitos].
  for (const [field, values] of [['tipo', donation.type], ['metodo', donation.method], ['status', donation.status]]) {
    const detail = enumDetail(query[field], field, values);
    if (detail) details.push(detail);
  }
  if (query.adotante_id !== undefined && !UUID_PATTERN.test(query.adotante_id)) {
    details.push({ field: 'adotante_id', message: 'Informe um identificador válido.' });
  }
  return details;
}

/*
 * FUNÇÃO: validateSummary
 * O que faz: o resumo só aceita o período.
 */
function validateSummary({ query }) {
  return periodDetails(query);
}

/*
 * FUNÇÃO: validateMonthly
 * O que faz: "meses" opcional, inteiro de 1 a 36.
 */
function validateMonthly({ query }) {
  if (query.meses === undefined) return [];
  const months = Number(query.meses);
  return Number.isInteger(months) && months >= 1 && months <= 36
    ? []
    : [{ field: 'meses', message: 'Informe um número de meses entre 1 e 36.' }];
}

/*
 * FUNÇÃO: donationPayloadDetails (interna)
 * O que faz: valida o corpo de cadastro (partial = false) ou de edição (partial = true).
 */
function donationPayloadDetails(body, partial) {
  // Nome do doador (obrigatório só no cadastro), tipo e status.
  const details = [
    textDetail(body, 'doador_nome', { min: 2, max: 150, required: !partial, message: 'Informe o nome do doador.' }),
    enumDetail(body.tipo, 'tipo', donation.type),
    enumDetail(body.status, 'status', donation.status),
  ].filter(Boolean);

  // Tipo obrigatório no cadastro.
  if (!partial && body.tipo === undefined) details.push({ field: 'tipo', message: 'Informe o tipo da doação (unica ou recorrente).' });
  // Forma de pagamento: opcional (null = não informada); se veio, precisa ser válida.
  if (body.metodo !== undefined && body.metodo !== null) {
    const method = enumDetail(body.metodo, 'metodo', donation.method);
    if (method) details.push(method);
  }

  // Valor: obrigatório no cadastro; na edição, só se enviado.
  if (!partial || Object.hasOwn(body, 'valor')) {
    const value = Number(body.valor);
    // "Até 2 casas decimais": multiplicado por 100, o valor precisa ser (praticamente) inteiro.
    // toFixed(4) evita falsos erros causados por imprecisão de números com vírgula (ex.: 0.1 + 0.2).
    const hasTwoDecimals = Number.isFinite(value) && Math.round(value * 100) === Number((value * 100).toFixed(4));
    if (typeof body.valor !== 'number' && typeof body.valor !== 'string') {
      details.push({ field: 'valor', message: 'Informe o valor da doação.' });
    } else if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE || !hasTwoDecimals) {
      details.push({ field: 'valor', message: 'Informe um valor maior que zero, com até duas casas decimais.' });
    }
  }

  // E-mail do doador: opcional (null ou vazio = sem e-mail).
  if (Object.hasOwn(body, 'doador_email') && body.doador_email !== null && body.doador_email !== ''
    && (typeof body.doador_email !== 'string' || !EMAIL_PATTERN.test(body.doador_email.trim()) || body.doador_email.length > 150)) {
    details.push({ field: 'doador_email', message: 'Informe um e-mail válido ou deixe em branco.' });
  }
  // Adotante vinculado: opcional; se veio, precisa ser UUID.
  if (Object.hasOwn(body, 'adotante_id') && body.adotante_id !== null && body.adotante_id !== ''
    && (typeof body.adotante_id !== 'string' || !UUID_PATTERN.test(body.adotante_id))) {
    details.push({ field: 'adotante_id', message: 'Informe um identificador válido ou deixe em branco.' });
  }
  // Data: texto ISO 8601 válido e não no futuro (tolerância de 1 minuto para diferenças de relógio).
  if (Object.hasOwn(body, 'data') && body.data !== null) {
    const date = typeof body.data === 'string' ? new Date(body.data) : null;
    if (!date || Number.isNaN(date.valueOf()) || date.getTime() > Date.now() + 60000) {
      details.push({ field: 'data', message: 'Informe uma data válida (ISO 8601) que não esteja no futuro.' });
    }
  }

  return details;
}

/*
 * FUNÇÃO: validateCreateDonation — cadastro completo.
 */
function validateCreateDonation({ body }) {
  return donationPayloadDetails(body, false);
}

/*
 * FUNÇÃO: validateUpdateDonation — edição: pelo menos um campo e validação parcial.
 */
function validateUpdateDonation({ body }) {
  const fields = ['adotante_id', 'doador_nome', 'doador_email', 'tipo', 'valor', 'metodo', 'status', 'data'];
  if (!fields.some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return donationPayloadDetails(body, true);
}

// Exporta os validadores.
module.exports = {
  validateListDonations,
  validateSummary,
  validateMonthly,
  validateCreateDonation,
  validateUpdateDonation,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada rota de doações usa o validador correspondente; com detalhes, a API
 *   responde 422 antes do service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validação de valores monetários (casas decimais e imprecisão de ponto flutuante).
 *   - Campos opcionais que aceitam null/vazio.
 *   - Datas ISO 8601 e tolerância de relógio.
 * ============================================================================
 */
