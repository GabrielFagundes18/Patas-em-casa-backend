/*
 * ============================================================================
 * ARQUIVO: public-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER das rotas PÚBLICAS (usadas pelo site, sem login). Um controller
 *   recebe a requisição, chama o "service" certo (onde fica a regra de negócio)
 *   e monta a resposta HTTP. Aqui ficam: catálogo de animais, perfil de um
 *   animal, histórias, passos da adoção, envio de pedido de adoção, inscrição
 *   de voluntário e números do site.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - listAnimals, getAnimal, listStories, listAdoptionSteps,
 *     createAdoptionRequest, applyAsVolunteer, getStats.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Services: animals, adoptions (adoption-request), content (adoption-step),
 *     dashboard, stories, volunteers.
 *   - ../../utils/http-response (formato das respostas) e ../../utils/pagination.
 *   - Usado por: ./public-routes.js.
 *   - No frontend: src/api/*.js (animals, adoptions, content, volunteers).
 * ============================================================================
 */

// Services (regras de negócio) usados pelas rotas públicas.
const animalService = require('../animals/animal-service');
const adoptionRequestService = require('../adoptions/adoption-request-service');
const adoptionStepService = require('../content/adoption-step-service');
const dashboardService = require('../dashboard/dashboard-service');
const storyService = require('../stories/story-service');
const volunteerService = require('../volunteers/volunteer-service');
// Formatos de resposta (lista paginada e sucesso simples).
const { listResponse, successResponse } = require('../../utils/http-response');
// Leitura de page/pageSize.
const { parsePagination } = require('../../utils/pagination');

/*
 * FUNÇÃO: listAnimals (controller async)
 * O que faz: lista os animais visíveis no site (disponíveis/urgentes), com filtros e paginação.
 * Parâmetros: req (req.query = filtros da URL), res.
 * Retorno: JSON { data: [animais], meta: { page, pageSize, total, totalPages } }.
 */
exports.listAnimals = async (req, res) => {
  // O service devolve a página de itens e o total geral.
  const { items, total } = await animalService.listPublicPage(req.query);
  // Lê de novo page/pageSize só para preencher o "meta" da resposta.
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * FUNÇÃO: getAnimal (controller async)
 * O que faz: devolve o perfil público de um animal pelo id da URL (/animals/:id).
 * Retorno: JSON { data: animal } (o service lança 404 se não existir ou não for público).
 */
exports.getAnimal = async (req, res) => {
  return res.json(successResponse(await animalService.getPublicById(req.params.id)));
};

/*
 * FUNÇÃO: listStories (controller async)
 * O que faz: lista as histórias de adoção publicadas, paginadas.
 */
exports.listStories = async (req, res) => {
  const { items, total } = await storyService.listPublished(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * FUNÇÃO: listAdoptionSteps (controller async)
 * O que faz: devolve os passos ativos do "como adotar" (seção do site).
 */
exports.listAdoptionSteps = async (req, res) => {
  return res.json(successResponse(await adoptionStepService.listActive()));
};

/*
 * FUNÇÃO: createAdoptionRequest (controller async)
 * O que faz: registra um pedido de adoção enviado pelo formulário do site.
 * Parâmetros: req.body = dados do formulário (já validados pela rota).
 * Retorno: 201 (Created = "criado") com os dados do pedido.
 */
exports.createAdoptionRequest = async (req, res) => {
  return res.status(201).json(successResponse(await adoptionRequestService.create(req.body)));
};

/*
 * FUNÇÃO: applyAsVolunteer (controller async)
 * O que faz: registra a inscrição de um voluntário pelo site.
 * Retorno: 201 com os dados da inscrição.
 */
exports.applyAsVolunteer = async (req, res) => {
  return res.status(201).json(successResponse(await volunteerService.apply(req.body)));
};

/*
 * FUNÇÃO: getStats (controller async)
 * O que faz: devolve os números públicos do site (ex.: animais adotados, disponíveis).
 */
exports.getStats = async (req, res) => {
  return res.json(successResponse(await dashboardService.publicStats()));
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas públicas (já validadas e com limite de envios) chamam estas
 *   funções; cada uma chama o service, embrulha o resultado em successResponse
 *   ou listResponse e responde (200 para leituras, 201 para criações). Erros
 *   lançados pelos services sobem pelo asyncHandler até o error-handler.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Arquitetura em camadas: rotas → controllers → services → repositories.
 *   - Controllers "finos" (só traduzem HTTP ↔ service).
 *   - Status 200 x 201.
 *   - req.query, req.params e req.body.
 * ============================================================================
 */
