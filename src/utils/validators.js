/*
 * ============================================================================
 * ARQUIVO: validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Reúne VALIDAÇÕES REUTILIZÁVEIS (formatos de UUID, e-mail, telefone, data;
 *   valores de lista; textos com tamanho mínimo/máximo; parâmetros de listagem).
 *   Cada validação devolve um "detalhe de erro" no formato
 *   { field, message } — ou null/[] quando está tudo certo. Os validadores de
 *   cada módulo juntam esses detalhes, e o middleware validate-request responde
 *   422 (VALIDACAO_INVALIDA) se houver algum.
 *
 * PRINCIPAIS ITENS:
 *   - UUID_PATTERN, EMAIL_PATTERN, PHONE_PATTERN, DATE_PATTERN (expressões regulares).
 *   - enumDetail, validateIdParam, listQueryDetails, emailDetail, textDetail, isValidDate.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./pagination (parsePagination).
 *   - Usado por: modules/*\/...-validators.js e middleware/validate-request.js.
 * ============================================================================
 */

// Validação de paginação (reaproveitada em listQueryDetails).
const { parsePagination } = require('./pagination');

// UUID: identificador no formato 8-4-4-4-12 caracteres hexadecimais (0-9, a-f).
// [1-8] confere a versão do UUID; [89ab] confere a "variante". A flag "i" ignora maiúsculas/minúsculas.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// E-mail simples: algo sem espaço/@, um "@", algo, um ponto, algo.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Telefone: só dígitos, parênteses, +, - e espaços.
const PHONE_PATTERN = /^[0-9()+\-\s]+$/;
// Data no formato AAAA-MM-DD.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/*
 * FUNÇÃO: enumDetail
 * O que faz: confere se o valor está na lista de opções permitidas.
 * Parâmetros: value (qualquer), field (string), values (array de opções).
 * Retorno: null se ok (ou se o valor não foi enviado); senão { field, message }.
 */
function enumDetail(value, field, values) {
  // Campo não enviado: nada a validar (a obrigatoriedade é conferida em outro lugar).
  if (value === undefined) return null;
  return values.includes(value)
    ? null
    : { field, message: `Valor inválido. Opções permitidas: ${values.join(', ')}.` };
}

/*
 * FUNÇÃO: validateIdParam
 * O que faz: valida o ":id" da URL (precisa ser um UUID).
 * Parâmetros: um objeto com "params" (normalmente a própria req). "{ params }" desestrutura direto no parâmetro.
 * Retorno (array): [] se ok; senão [{ field: 'id', message }].
 * Onde é usada: rotas como GET /animals/:id (via validateRequest).
 */
function validateIdParam({ params }) {
  return UUID_PATTERN.test(params.id) ? [] : [{ field: 'id', message: 'Informe um identificador válido.' }];
}

/*
 * FUNÇÃO: listQueryDetails
 * O que faz: valida os parâmetros comuns das listagens: page, pageSize, q (busca), sort e order.
 * Parâmetros:
 *   - query (objeto): req.query.
 *   - sortFields (array de strings): campos pelos quais é permitido ordenar.
 * Retorno (array): lista de detalhes de erro (vazia se tudo ok).
 */
// Paginação, busca textual e ordenação comuns às listagens.
function listQueryDetails(query, sortFields) {
  const details = [];

  // parsePagination lança AppError se page/pageSize forem inválidos: aqui capturamos
  // o erro e só aproveitamos os detalhes ("|| []" caso não haja detalhes).
  try {
    parsePagination(query);
  } catch (error) {
    details.push(...(error.details || []));
  }

  // Busca: precisa ser texto de até 120 caracteres.
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 120)) {
    details.push({ field: 'q', message: 'A busca deve ter no máximo 120 caracteres.' });
  }
  // Ordenação: só pelos campos permitidos (o nome vai para o SQL, então precisa vir de lista fixa).
  if (query.sort !== undefined && !sortFields.includes(query.sort)) {
    details.push({ field: 'sort', message: `Campo de ordenação não permitido. Use: ${sortFields.join(', ')}.` });
  }
  // Direção: asc (crescente) ou desc (decrescente), aceitando maiúsculas.
  if (query.order !== undefined && (typeof query.order !== 'string' || !['asc', 'desc'].includes(query.order.toLowerCase()))) {
    details.push({ field: 'order', message: 'Use asc ou desc para a ordenação.' });
  }

  return details;
}

/*
 * FUNÇÃO: emailDetail
 * O que faz: valida o campo "email" do corpo da requisição.
 * Parâmetros:
 *   - body (objeto): req.body.
 *   - required (boolean): se o e-mail é obrigatório.
 * Retorno: null se ok; senão { field: 'email', message }.
 */
function emailDetail(body, required) {
  // Object.hasOwn(obj, 'chave'): o objeto tem essa propriedade (própria, não herdada)?
  if (!Object.hasOwn(body, 'email')) {
    return required ? { field: 'email', message: 'Informe um e-mail válido.' } : null;
  }
  // Texto, no formato de e-mail e com até 150 caracteres (sem contar espaços nas pontas).
  return typeof body.email === 'string' && EMAIL_PATTERN.test(body.email.trim()) && body.email.trim().length <= 150
    ? null
    : { field: 'email', message: 'Informe um e-mail válido.' };
}

/*
 * FUNÇÃO: textDetail
 * O que faz: valida um campo de texto do corpo.
 * Parâmetros:
 *   - body (objeto): req.body.
 *   - field (string): nome do campo.
 *   - opções (objeto, desestruturado): min (padrão 1), max, required (padrão false), message.
 * Retorno: null se ok; senão { field, message }.
 */
function textDetail(body, field, { min = 1, max, required = false, message }) {
  // Ausente ou null: erro só se for obrigatório.
  if (!Object.hasOwn(body, field) || body[field] === null) {
    return required ? { field, message } : null;
  }
  // Precisa ser texto.
  if (typeof body[field] !== 'string') return { field, message };
  // Tamanho sem os espaços das pontas.
  const length = body[field].trim().length;
  if (length < min) return { field, message };
  // Máximo só é conferido se foi informado.
  if (max && length > max) return { field, message: `Use no máximo ${max} caracteres.` };
  return null;
}

/*
 * FUNÇÃO: isValidDate
 * O que faz: confere se o texto é uma data AAAA-MM-DD que existe (ex.: rejeita 2026-02-30).
 * Parâmetros: value (qualquer).
 * Retorno (boolean).
 */
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  // Cria a data em UTC e confere se, convertida de volta, continua igual (datas impossíveis "transbordam").
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

// Exporta padrões e funções.
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

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada validador de módulo chama estas funções e junta os resultados num array
 *   de detalhes. Se o array tiver itens, validate-request responde 422 com a
 *   lista, e o painel mostra a mensagem ao lado de cada campo.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validação de entrada no servidor (nunca confiar só na validação do frontend).
 *   - Expressões regulares para formatos (UUID, e-mail, data).
 *   - Object.hasOwn, typeof, trim e desestruturação com valores padrão.
 *   - Padrão de "detalhes de erro" por campo ({ field, message }).
 * ============================================================================
 */
