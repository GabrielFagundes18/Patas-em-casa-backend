/*
 * ============================================================================
 * ARQUIVO: story-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES das HISTÓRIAS: filtros da lista e dados de cadastro/edição
 *   (autor, texto, URL da foto, publicado e vínculos com animal/adotante).
 *
 * PRINCIPAIS ITENS:
 *   - urlDetail, storyDetails (internas).
 *   - validateListStories, validateCreateStory, validateUpdateStory (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/validators.
 *   - Usado por: ./story-routes.js.
 * ============================================================================
 */

// Validações reutilizáveis.
const { UUID_PATTERN, listQueryDetails, textDetail } = require('../../utils/validators');

/*
 * FUNÇÃO: urlDetail (interna)
 * O que faz: foto_url opcional; se informada, precisa ser http(s) válida com até 2048 caracteres.
 * Detalhe: new URL() lança erro se o texto não for uma URL; o catch transforma isso em detalhe de erro.
 */
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

/*
 * FUNÇÃO: storyDetails (interna)
 * O que faz: valida o corpo; partial = true na edição (campos obrigatórios só no cadastro).
 */
function storyDetails(body, partial) {
  const details = [
    textDetail(body, 'autor_nome', { min: 2, max: 150, required: !partial, message: 'Informe o nome de quem conta a história.' }),
    textDetail(body, 'texto', { min: 10, max: 5000, required: !partial, message: 'Escreva a história (de 10 a 5000 caracteres).' }),
    urlDetail(body),
  ].filter(Boolean);

  // "publicado", se enviado, precisa ser booleano.
  if (Object.hasOwn(body, 'publicado') && typeof body.publicado !== 'boolean') {
    details.push({ field: 'publicado', message: 'Informe true ou false.' });
  }
  // Vínculos opcionais: UUID, null ou vazio.
  for (const field of ['animal_id', 'adotante_id']) {
    if (Object.hasOwn(body, field) && body[field] !== null && body[field] !== ''
      && (typeof body[field] !== 'string' || !UUID_PATTERN.test(body[field]))) {
      details.push({ field, message: 'Informe um identificador válido ou deixe em branco.' });
    }
  }
  return details;
}

/*
 * FUNÇÃO: validateListStories
 * O que faz: paginação/busca/ordenação (só por criado_em), publicado e animal_id.
 */
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

/*
 * FUNÇÃO: validateCreateStory — cadastro (autor e texto obrigatórios).
 */
function validateCreateStory({ body }) {
  return storyDetails(body, false);
}

/*
 * FUNÇÃO: validateUpdateStory — edição (ao menos um campo; validação parcial).
 */
function validateUpdateStory({ body }) {
  if (!['autor_nome', 'texto', 'foto_url', 'publicado', 'animal_id', 'adotante_id'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }
  return storyDetails(body, true);
}

// Exporta os validadores.
module.exports = { validateListStories, validateCreateStory, validateUpdateStory };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas de histórias usam estes validadores; com detalhes, a API responde 422.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validar URLs com new URL() e try/catch.
 *   - Reaproveitar a mesma validação para criar e editar (parâmetro "partial").
 * ============================================================================
 */
