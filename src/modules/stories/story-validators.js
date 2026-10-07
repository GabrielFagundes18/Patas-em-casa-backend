const { UUID_PATTERN, listQueryDetails, textDetail } = require('../../utils/validators');

function urlDetail(body) {
  if (!Object.hasOwn(body, 'foto_url') || body.foto_url === null || body.foto_url === '') return null;
  try {
    const url = new URL(body.foto_url);
    return ['http:', 'https:'].includes(url.protocol) && body.foto_url.length <= 2048
      ? null
      : { field: 'foto_url', message: 'Informe um endereço http(s) de até 2048 caracteres.' };
  } catch (error) {
    return { field: 'foto_url', message: 'Informe um endereço http(s) de até 2048 caracteres.' };
  }
}

function storyDetails(body, partial) {
  const details = [
    textDetail(body, 'autor_nome', { min: 2, max: 150, required: !partial, message: 'Informe o nome de quem conta a história.' }),
    textDetail(body, 'texto', { min: 10, max: 5000, required: !partial, message: 'Escreva a história (de 10 a 5000 caracteres).' }),
    urlDetail(body),
  ].filter(Boolean);

  if (Object.hasOwn(body, 'publicado') && typeof body.publicado !== 'boolean') {
    details.push({ field: 'publicado', message: 'Informe true ou false.' });
  }
  for (const field of ['animal_id', 'adotante_id']) {
    if (Object.hasOwn(body, field) && body[field] !== null && body[field] !== ''
      && (typeof body[field] !== 'string' || !UUID_PATTERN.test(body[field]))) {
      details.push({ field, message: 'Informe um identificador válido ou deixe em branco.' });
    }
  }
  return details;
}

function validateListStories({ query }) {
  const details = listQueryDetails(query, ['criado_em']);
  if (query.publicado !== undefined && !['true', 'false'].includes(query.publicado)) {
    details.push({ field: 'publicado', message: 'Informe true ou false.' });
  }
  if (query.animal_id !== undefined && !UUID_PATTERN.test(query.animal_id)) {
    details.push({ field: 'animal_id', message: 'Informe um identificador válido.' });
  }
  return details;
}

function validateCreateStory({ body }) {
  return storyDetails(body, false);
}

function validateUpdateStory({ body }) {
  if (!['autor_nome', 'texto', 'foto_url', 'publicado', 'animal_id', 'adotante_id'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return storyDetails(body, true);
}

module.exports = { validateListStories, validateCreateStory, validateUpdateStory };
