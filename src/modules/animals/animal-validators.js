/*
 * ============================================================================
 * ARQUIVO: animal-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES do módulo de animais: conferem os filtros da listagem, os
 *   dados de cadastro/edição, a mudança de status e os ids das fotos ANTES de
 *   chegar ao service. Cada função devolve uma lista de detalhes de erro
 *   ({ field, message }); lista vazia = tudo certo.
 *
 * PRINCIPAIS ITENS:
 *   - UPDATE_FIELDS, MAX_TEMPERAMENT_TRAITS, MAX_TRAIT_LENGTH, ENUM_FIELDS.
 *   - validateListAnimals, validateCreateAnimal, validateUpdateAnimal,
 *     validateAnimalStatus, validatePhotoParams (exportadas).
 *   - validateAnimalPayload, validateReason (internas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values (valores aceitos), utils/pagination, utils/validators.
 *   - Usado por: ./animal-routes.js e modules/public/public-routes.js (catálogo do site).
 * ============================================================================
 */

// Valores aceitos para os campos de escolha do animal.
const { animal } = require('../../config/domain-values');
// Validação de page/pageSize.
const { parsePagination } = require('../../utils/pagination');
// Padrão de UUID e validação de lista de opções.
const { UUID_PATTERN, enumDetail } = require('../../utils/validators');
// Campos aceitos numa edição (pelo menos um precisa vir).
const UPDATE_FIELDS = [
  'nome',
  'especie',
  'raca',
  'sexo',
  'idade_anos',
  'porte',
  'status',
  'descricao',
  'foto_url',
  'data_entrada',
  'castrado',
  'vacinado',
  'temperamento',
];

// Limites do temperamento: até 10 traços de até 40 caracteres.
const MAX_TEMPERAMENT_TRAITS = 10;
const MAX_TRAIT_LENGTH = 40;

// Campos de valor fechado (domain-values), validados igual na listagem e no cadastro.
// Pares [campo, lista de valores permitidos].
const ENUM_FIELDS = [
  ['especie', animal.species],
  ['sexo', animal.sex],
  ['porte', animal.size],
  ['status', animal.status],
];

/*
 * FUNÇÃO: validateListAnimals
 * O que faz: valida os filtros da listagem (query string).
 * Parâmetros: { query }.
 * Retorno (array): detalhes de erro.
 */
function validateListAnimals({ query }) {
  const details = [];

  // Paginação: aproveita os detalhes do erro de parsePagination, se houver.
  try {
    parsePagination(query);
  } catch (error) {
    details.push(...(error.details || []));
  }

  // Filtros de escolha: um único valor (texto) e dentro da lista permitida.
  // (Se a URL tiver o mesmo parâmetro duas vezes, o Express entrega um array.)
  for (const [field, values] of ENUM_FIELDS) {
    if (query[field] !== undefined && typeof query[field] !== 'string') {
      details.push({ field, message: 'Informe um único valor de filtro.' });
      // "continue" pula para o próximo campo do laço.
      continue;
    }
    const detail = enumDetail(query[field], field, values);
    if (detail) details.push(detail);
  }

  // Booleanos na URL chegam como texto: só "true" ou "false".
  for (const field of ['castrado', 'vacinado']) {
    if (query[field] !== undefined && !['true', 'false'].includes(query[field])) {
      details.push({ field, message: 'Informe true ou false.' });
    }
  }

  // Idades: número finito entre 0 e 999,9.
  for (const field of ['idadeMin', 'idadeMax']) {
    if (query[field] !== undefined) {
      const value = Number(query[field]);
      if (!Number.isFinite(value) || value < 0 || value > 999.9) {
        details.push({ field, message: 'Informe uma idade entre 0 e 999,9 anos.' });
      }
    }
  }

  // Ordenação: só os campos permitidos (mesma lista de SORT_COLUMNS do repository).
  if (query.sort && !['nome', 'data_entrada', 'idade_anos', 'status', 'especie', 'porte'].includes(query.sort)) {
    details.push({ field: 'sort', message: 'Campo de ordenação não permitido.' });
  }

  // Direção da ordenação.
  if (query.order && (typeof query.order !== 'string' || !['asc', 'desc'].includes(query.order.toLowerCase()))) {
    details.push({ field: 'order', message: 'Use asc ou desc para a ordenação.' });
  }

  // Busca textual: até 120 caracteres.
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 120)) {
    details.push({ field: 'q', message: 'A busca deve ter no máximo 120 caracteres.' });
  }

  // Faixa coerente: mínimo não pode passar do máximo.
  if (query.idadeMin !== undefined && query.idadeMax !== undefined
    && Number(query.idadeMin) > Number(query.idadeMax)) {
    details.push({ field: 'idadeMax', message: 'A idade máxima deve ser maior ou igual à idade mínima.' });
  }

  return details;
}

/*
 * FUNÇÃO: validateAnimalPayload (interna)
 * O que faz: valida o corpo de cadastro (partial = false) ou de edição (partial = true).
 *   Na edição, só os campos ENVIADOS são conferidos.
 * Parâmetros: body (objeto) e partial (boolean).
 * Retorno (array): detalhes de erro.
 */
function validateAnimalPayload(body, partial) {
  const details = [];

  // Nome: obrigatório no cadastro; na edição, só se enviado. Até 100 caracteres.
  if (!partial || Object.hasOwn(body, 'nome')) {
    if (typeof body.nome !== 'string' || !body.nome.trim()) {
      details.push({ field: 'nome', message: 'Informe o nome do animal.' });
    } else if (body.nome.trim().length > 100) {
      details.push({ field: 'nome', message: 'O nome deve ter no máximo 100 caracteres.' });
    }
  }

  // Campos de escolha.
  for (const [field, values] of ENUM_FIELDS) {
    // Edição: campo não enviado não é conferido.
    if (partial && !Object.hasOwn(body, field)) continue;
    // Cadastro sem espécie: o erro específico é adicionado logo abaixo.
    if (!partial && field === 'especie' && !body.especie) continue;
    // Sexo e porte podem ser apagados (null = "não informado").
    if (['sexo', 'porte'].includes(field) && body[field] === null) continue;
    const detail = enumDetail(body[field], field, values);
    if (detail) details.push(detail);
  }
  // Espécie é obrigatória no cadastro.
  if (!partial && !body.especie) {
    details.push({ field: 'especie', message: 'Informe a espécie.' });
  }

  // Idade (opcional; null = não informada).
  if (Object.hasOwn(body, 'idade_anos') && body.idade_anos !== null) {
    const age = Number(body.idade_anos);
    if (!Number.isFinite(age) || age < 0 || age > 999.9) {
      details.push({ field: 'idade_anos', message: 'Informe uma idade entre 0 e 999,9 anos.' });
    }
  }

  // No corpo JSON, booleanos precisam ser true/false de verdade (não texto).
  for (const field of ['castrado', 'vacinado']) {
    if (Object.hasOwn(body, field) && typeof body[field] !== 'boolean') {
      details.push({ field, message: 'Informe true ou false.' });
    }
  }

  // Textos opcionais com tamanho máximo: pares [campo, máximo].
  for (const [field, maxLength] of [['raca', 100], ['descricao', 10000], ['foto_url', 2048]]) {
    if (Object.hasOwn(body, field)
      && body[field] !== null
      && (typeof body[field] !== 'string' || body[field].length > maxLength)) {
      details.push({ field, message: `Informe um texto de até ${maxLength} caracteres.` });
    }
  }

  // Temperamento: lista curta de traços (ex.: "brincalhão", "convive com gatos").
  if (Object.hasOwn(body, 'temperamento')) {
    const traits = body.temperamento;
    // Precisa ser array, com até 10 itens, e cada item um texto não vazio de até 40 caracteres.
    // "some" devolve true se ALGUM item falhar na condição.
    if (!Array.isArray(traits) || traits.length > MAX_TEMPERAMENT_TRAITS
      || traits.some((trait) => typeof trait !== 'string' || !trait.trim() || trait.trim().length > MAX_TRAIT_LENGTH)) {
      details.push({
        field: 'temperamento',
        message: `Informe até ${MAX_TEMPERAMENT_TRAITS} traços de até ${MAX_TRAIT_LENGTH} caracteres cada.`,
      });
    }
  }

  // Data de entrada: AAAA-MM-DD que exista de verdade (mesma técnica de utils/validators.isValidDate).
  if (Object.hasOwn(body, 'data_entrada')) {
    const value = body.data_entrada;
    const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : null;
    if (!date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
      details.push({ field: 'data_entrada', message: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
  }

  return details;
}

/*
 * FUNÇÃO: validateCreateAnimal
 * O que faz: validação do cadastro (todos os obrigatórios).
 */
function validateCreateAnimal({ body }) {
  return validateAnimalPayload(body, false);
}

/*
 * FUNÇÃO: validateUpdateAnimal
 * O que faz: validação da edição: exige pelo menos um campo conhecido e confere os enviados + o motivo.
 */
function validateUpdateAnimal({ body }) {
  if (!UPDATE_FIELDS.some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  // Junta os detalhes das duas validações num array só.
  return [...validateAnimalPayload(body, true), ...validateReason(body)];
}

/*
 * FUNÇÃO: validatePhotoParams
 * O que faz: confere se :id (animal) e :photoId (foto) são UUIDs válidos.
 * Detalhe: "every" devolve true só se TODOS os itens passarem.
 */
function validatePhotoParams({ params }) {
  return [params.id, params.photoId].every((value) => UUID_PATTERN.test(value))
    ? []
    : [{ field: 'id', message: 'Informe identificadores válidos.' }];
}

/*
 * FUNÇÃO: validateReason (interna)
 * O que faz: o motivo (opcional) precisa ser texto de até 500 caracteres.
 *   (A obrigatoriedade do motivo é decidida em animal-status-rules.js.)
 */
function validateReason(body) {
  if (body.motivo !== undefined && (typeof body.motivo !== 'string' || body.motivo.length > 500)) {
    return [{ field: 'motivo', message: 'Descreva o motivo em até 500 caracteres.' }];
  }
  return [];
}

/*
 * FUNÇÃO: validateAnimalStatus
 * O que faz: valida PATCH /:id/status — status obrigatório e válido, motivo opcional.
 */
function validateAnimalStatus({ body }) {
  if (typeof body.status !== 'string' || body.status.length === 0) {
    return [{ field: 'status', message: 'Informe o status do animal.' }];
  }
  const detail = enumDetail(body.status, 'status', animal.status);
  return [...(detail ? [detail] : []), ...validateReason(body)];
}

// Exporta os validadores usados nas rotas.
module.exports = {
  validatePhotoParams,
  validateListAnimals,
  validateCreateAnimal,
  validateUpdateAnimal,
  validateAnimalStatus,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas usam validateRequest(validador). Cada validador confere o formato
 *   de query/body/params e devolve detalhes; com detalhes, a API responde 422.
 *   O cadastro exige nome e espécie; a edição exige ao menos um campo e só
 *   confere o que foi enviado.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validação completa x parcial (POST x PUT/PATCH).
 *   - Laços for...of com desestruturação ([campo, valores]) e "continue".
 *   - Array.some e Array.every; Object.hasOwn.
 *   - Diferença entre valores da URL (sempre texto) e do corpo JSON (tipados).
 * ============================================================================
 */
