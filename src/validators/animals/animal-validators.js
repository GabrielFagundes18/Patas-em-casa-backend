const { animal } = require('../../config/domain-values');
const { parsePagination } = require('../../utils/pagination');
const { enumDetail } = require('../common-validators');
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
];

// Campos de valor fechado (domain-values), validados igual na listagem e no cadastro.
const ENUM_FIELDS = [
  ['especie', animal.species],
  ['sexo', animal.sex],
  ['porte', animal.size],
  ['status', animal.status],
];

function validateListAnimals({ query }) {
  const details = [];

  try {
    parsePagination(query);
  } catch (error) {
    details.push(...(error.details || []));
  }

  for (const [field, values] of ENUM_FIELDS) {
    if (query[field] !== undefined && typeof query[field] !== 'string') {
      details.push({ field, message: 'Informe um único valor de filtro.' });
      continue;
    }
    const detail = enumDetail(query[field], field, values);
    if (detail) details.push(detail);
  }

  for (const field of ['castrado', 'vacinado']) {
    if (query[field] !== undefined && !['true', 'false'].includes(query[field])) {
      details.push({ field, message: 'Informe true ou false.' });
    }
  }

  for (const field of ['idadeMin', 'idadeMax']) {
    if (query[field] !== undefined) {
      const value = Number(query[field]);
      if (!Number.isFinite(value) || value < 0 || value > 999.9) {
        details.push({ field, message: 'Informe uma idade entre 0 e 999,9 anos.' });
      }
    }
  }

  if (query.sort && !['nome', 'data_entrada', 'idade_anos', 'status', 'especie', 'porte'].includes(query.sort)) {
    details.push({ field: 'sort', message: 'Campo de ordenação não permitido.' });
  }

  if (query.order && (typeof query.order !== 'string' || !['asc', 'desc'].includes(query.order.toLowerCase()))) {
    details.push({ field: 'order', message: 'Use asc ou desc para a ordenação.' });
  }

  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 120)) {
    details.push({ field: 'q', message: 'A busca deve ter no máximo 120 caracteres.' });
  }

  if (query.idadeMin !== undefined && query.idadeMax !== undefined
    && Number(query.idadeMin) > Number(query.idadeMax)) {
    details.push({ field: 'idadeMax', message: 'A idade máxima deve ser maior ou igual à idade mínima.' });
  }

  return details;
}

function validateAnimalPayload(body, partial) {
  const details = [];

  if (!partial || Object.hasOwn(body, 'nome')) {
    if (typeof body.nome !== 'string' || !body.nome.trim()) {
      details.push({ field: 'nome', message: 'Informe o nome do animal.' });
    } else if (body.nome.trim().length > 100) {
      details.push({ field: 'nome', message: 'O nome deve ter no máximo 100 caracteres.' });
    }
  }

  for (const [field, values] of ENUM_FIELDS) {
    if (partial && !Object.hasOwn(body, field)) continue;
    if (!partial && field === 'especie' && !body.especie) continue;
    if (['sexo', 'porte'].includes(field) && body[field] === null) continue;
    const detail = enumDetail(body[field], field, values);
    if (detail) details.push(detail);
  }
  if (!partial && !body.especie) {
    details.push({ field: 'especie', message: 'Informe a espécie.' });
  }

  if (Object.hasOwn(body, 'idade_anos') && body.idade_anos !== null) {
    const age = Number(body.idade_anos);
    if (!Number.isFinite(age) || age < 0 || age > 999.9) {
      details.push({ field: 'idade_anos', message: 'Informe uma idade entre 0 e 999,9 anos.' });
    }
  }

  for (const field of ['castrado', 'vacinado']) {
    if (Object.hasOwn(body, field) && typeof body[field] !== 'boolean') {
      details.push({ field, message: 'Informe true ou false.' });
    }
  }

  for (const [field, maxLength] of [['raca', 100], ['descricao', 10000], ['foto_url', 2048]]) {
    if (Object.hasOwn(body, field)
      && body[field] !== null
      && (typeof body[field] !== 'string' || body[field].length > maxLength)) {
      details.push({ field, message: `Informe um texto de até ${maxLength} caracteres.` });
    }
  }

  if (Object.hasOwn(body, 'data_entrada')) {
    const value = body.data_entrada;
    const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : null;
    if (!date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
      details.push({ field: 'data_entrada', message: 'Informe uma data válida no formato AAAA-MM-DD.' });
    }
  }

  return details;
}

function validateCreateAnimal({ body }) {
  return validateAnimalPayload(body, false);
}

function validateUpdateAnimal({ body }) {
  if (!UPDATE_FIELDS.some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return [...validateAnimalPayload(body, true), ...validateReason(body)];
}

function validateReason(body) {
  if (body.motivo !== undefined && (typeof body.motivo !== 'string' || body.motivo.length > 500)) {
    return [{ field: 'motivo', message: 'Descreva o motivo em até 500 caracteres.' }];
  }
  return [];
}

function validateAnimalStatus({ body }) {
  if (typeof body.status !== 'string' || body.status.length === 0) {
    return [{ field: 'status', message: 'Informe o status do animal.' }];
  }
  const detail = enumDetail(body.status, 'status', animal.status);
  return [...(detail ? [detail] : []), ...validateReason(body)];
}

module.exports = {
  validateListAnimals,
  validateCreateAnimal,
  validateUpdateAnimal,
  validateAnimalStatus,
};