/*
 * ============================================================================
 * ARQUIVO: public-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS PÚBLICAS da API (prefixo /api/v1/public), usadas pelo site
 *   sem login: catálogo e perfil de animais, histórias, passos da adoção,
 *   números, formulários (adoção, voluntariado) e doação online (checkout,
 *   status e cancelamento de assinatura). Formulários têm um limite de envios
 *   por IP para evitar spam.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *   - publicFormRateLimit: até 10 envios por hora por IP.
 *   - validatePublicPage: valida a paginação/ordenação da lista de histórias.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./public-controller e ../donations/online-donation-controller (respostas).
 *   - Middlewares: async-handler, rate-limit, validate-request.
 *   - Validadores: utils/validators, animals, adoptions, volunteers, donations (online).
 *   - Montado em src/app.js em "/api/v1/public".
 * ============================================================================
 */

// Express.
const express = require('express');
// Controller das rotas públicas.
const ControllerPublic = require('./public-controller');
// Embrulha controllers async para repassar erros.
const asyncHandler = require('../../middleware/async-handler');
// Limite de requisições.
const rateLimit = require('../../middleware/rate-limit');
// Executa validadores antes do controller.
const validateRequest = require('../../middleware/validate-request');
// Validadores genéricos (id na URL e parâmetros de listagem).
const { validateIdParam, listQueryDetails } = require('../../utils/validators');
// Validadores específicos de cada módulo.
const { validateListAnimals } = require('../animals/animal-validators');
const validateAdoptionRequest = require('../adoptions/adoption-request-validator');
const { validateVolunteerApplication } = require('../volunteers/volunteer-validators');
// Doação online (Mercado Pago): controller e validadores.
const ControllerOnlineDonations = require('../donations/online-donation-controller');
const {
  validateCancelByToken,
  validateCancelLinkRequest,
  validateCheckout,
} = require('../donations/online-donation-validators');

// Rotas sem login: só dados públicos. Formulários têm limite de envios por IP.
const router = express.Router();
// No máximo 10 envios de formulário por hora (60 × 60 × 1000 ms) por IP.
const publicFormRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
// Validador da lista de histórias: paginação e ordenação só por "criado_em".
// "({ query }) =>" desestrutura o objeto recebido e pega só "query".
const validatePublicPage = ({ query }) => listQueryDetails(query, ['criado_em']);

// Cada rota: método + caminho + middlewares (na ordem) + controller.
// Catálogo de animais (com filtros validados).
router.get('/animals', validateRequest(validateListAnimals), asyncHandler(ControllerPublic.listAnimals));
// Perfil de um animal (id precisa ser UUID).
router.get('/animals/:id', validateRequest(validateIdParam), asyncHandler(ControllerPublic.getAnimal));
// Histórias publicadas.
router.get('/stories', validateRequest(validatePublicPage), asyncHandler(ControllerPublic.listStories));
// Passos do "como adotar".
router.get('/adoption-steps', asyncHandler(ControllerPublic.listAdoptionSteps));
// Números do site.
router.get('/stats', asyncHandler(ControllerPublic.getStats));
// Formulário de adoção: limite de envios → validação → controller.
router.post('/adoption-requests', publicFormRateLimit, validateRequest(validateAdoptionRequest), asyncHandler(ControllerPublic.createAdoptionRequest));
// Formulário de voluntariado.
router.post('/volunteers', publicFormRateLimit, validateRequest(validateVolunteerApplication), asyncHandler(ControllerPublic.applyAsVolunteer));
// Doação online: cria o pagamento no Mercado Pago.
router.post('/donations/checkout', publicFormRateLimit, validateRequest(validateCheckout), asyncHandler(ControllerOnlineDonations.checkout));
// Consulta o andamento de uma doação pela referência (:ref).
router.get('/donations/status/:ref', asyncHandler(ControllerOnlineDonations.status));
// Pede por e-mail o link para cancelar uma doação mensal.
router.post('/donations/subscriptions/cancel-link', publicFormRateLimit, validateRequest(validateCancelLinkRequest), asyncHandler(ControllerOnlineDonations.requestCancelLink));
// Cancela a doação mensal usando o token recebido no e-mail.
router.post('/donations/subscriptions/cancel', publicFormRateLimit, validateRequest(validateCancelByToken), asyncHandler(ControllerOnlineDonations.cancelByToken));

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Leituras (GET) passam pela validação e vão ao controller. Envios (POST)
 *   passam antes pelo limite de 10 por hora por IP, depois pela validação, e só
 *   então pelo controller. Erros de qualquer etapa terminam no error-handler.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Rotas públicas x rotas protegidas.
 *   - Proteção de formulários contra spam (rate limit por IP).
 *   - Parâmetros de rota (:id, :ref) e ordem dos middlewares.
 * ============================================================================
 */
