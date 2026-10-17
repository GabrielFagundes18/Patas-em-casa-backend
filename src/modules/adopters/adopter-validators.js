/*
 * ============================================================================
 * ARQUIVO: adopter-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES do módulo de ADOTANTES: filtros da listagem, dados de edição e
 *   a palavra de confirmação exigida nas ações irreversíveis da LGPD.
 *
 * PRINCIPAIS ITENS:
 *   - SORT_FIELDS, STATE_PATTERN (sigla do estado: duas letras maiúsculas).
 *   - validateListAdopters, validateUpdateAdopter, validateConfirmation (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values (status do adotante), utils/validators.
 *   - Usado por: ./adopter-routes.js.
 * ============================================================================
 */

// Valores de status aceitos.
const { adopter } = require('../../config/domain-values');
// Padrões e validações reutilizáveis.
const {
  EMAIL_PATTERN,
  PHONE_PATTERN,
  enumDetail,
  listQueryDetails,
  textDetail,
} = require('../../utils/validators');

// Campos permitidos para ordenação.
const SORT_FIELDS = ['nome', 'criado_em', 'cidade', 'status'];
// Sigla de estado: exatamente 2 letras maiúsculas (ex.: SP, RJ).
const STATE_PATTERN = /^[A-Z]{2}$/;

/*
 * FUNÇÃO: validateListAdopters
 * O que faz: valida paginação/busca/ordenação, status, estado e cidade da listagem.
 * Retorno (array): detalhes de erro.
 */
function validateListAdopters({ query }) {
  // Começa com os detalhes dos parâmetros comuns de lista.
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

/*
 * FUNÇÃO: validateUpdateAdopter
 * O que faz: valida a edição (pelo menos um campo; cada campo enviado no formato certo).
 * Retorno (array): detalhes de erro.
 */
function validateUpdateAdopter({ body }) {
  const fields = ['nome', 'email', 'telefone', 'cidade', 'estado', 'endereco', 'status'];
  if (!fields.some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }

  // Validações de texto e status; filter(Boolean) remove os resultados null (campos ok).
  const details = [
    textDetail(body, 'nome', { min: 2, max: 150, message: 'Informe o nome completo.' }),
    textDetail(body, 'cidade', { min: 2, max: 100, message: 'Informe a cidade.' }),
    textDetail(body, 'endereco', { min: 5, max: 500, message: 'Informe o endereço completo.' }),
    enumDetail(body.status, 'status', adopter.status),
  ].filter(Boolean);

  // E-mail (se enviado): formato válido e até 150 caracteres.
  if (Object.hasOwn(body, 'email')
    && (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim()) || body.email.trim().length > 150)) {
    details.push({ field: 'email', message: 'Informe um e-mail válido.' });
  }
  // Telefone (se enviado e não null): caracteres permitidos, até 20 caracteres e 10 a 13 dígitos
  // (DDD + número, com ou sem código do país).
  if (Object.hasOwn(body, 'telefone') && body.telefone !== null) {
    const digits = typeof body.telefone === 'string' ? body.telefone.replace(/\D/g, '') : '';
    if (typeof body.telefone !== 'string' || !PHONE_PATTERN.test(body.telefone) || body.telefone.length > 20
      || digits.length < 10 || digits.length > 13) {
      details.push({ field: 'telefone', message: 'Informe um telefone com DDD.' });
    }
  }
  // Estado (se enviado e não null): sigla válida.
  if (Object.hasOwn(body, 'estado') && body.estado !== null && !STATE_PATTERN.test(body.estado)) {
    details.push({ field: 'estado', message: 'Use a sigla do estado com duas letras maiúsculas (ex.: SP).' });
  }

  return details;
}

/*
 * FUNÇÃO: validateConfirmation (fábrica de validador)
 * O que faz: cria um validador que exige body.confirmacao igual à palavra esperada.
 * Parâmetros: expected (string) — ex.: 'ANONIMIZAR' ou 'EXCLUIR'.
 * Retorno (função validadora).
 */
// Ações irreversíveis da LGPD exigem que a palavra de confirmação seja digitada.
function validateConfirmation(expected) {
  return function validateConfirmationWord({ body }) {
    return body.confirmacao === expected
      ? []
      : [{ field: 'confirmacao', message: `Digite ${expected} para confirmar. Esta ação não pode ser desfeita.` }];
  };
}

// Exporta os validadores.
module.exports = { validateListAdopters, validateUpdateAdopter, validateConfirmation };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas de adotantes usam estes validadores via validate-request; qualquer
 *   detalhe gera 422. Anonimizar/excluir só seguem com a palavra exata digitada.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Expressões regulares para siglas e telefones.
 *   - Combinar validadores reutilizáveis (textDetail, enumDetail).
 *   - Confirmação explícita em ações destrutivas (boa prática de UX e segurança).
 * ============================================================================
 */
