/*
 * ============================================================================
 * ARQUIVO: adoption-request-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER dos PEDIDOS DE ADOÇÃO no painel (a "triagem"): listar, ver o
 *   quadro (board) por etapa, ver detalhes, revelar contatos, editar, aprovar,
 *   reprovar, agendar/remarcar/cancelar/concluir visitas e entrevistas e marcar
 *   o termo de adoção como assinado.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - list, board, getById, reveal, update, approve, reject, schedule, reschedule,
 *     cancelAppointment, completeAppointment, markTermSigned.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./adoption-triage-service (regras), ../audit/audit-service (auditContext).
 *   - utils/http-response, utils/pagination.
 *   - Usado por: ./adoption-request-routes.js.
 *   - (O pedido enviado pelo SITE usa outro caminho: public-controller → adoption-request-service.)
 * ============================================================================
 */

// Regras da triagem de pedidos.
const triageService = require('./adoption-triage-service');
// Autor da ação.
const { auditContext } = require('../audit/audit-service');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

/*
 * list — GET /api/v1/adoption-requests
 */
exports.list = async (req, res) => {
  const { items, total } = await triageService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * board — GET /api/v1/adoption-requests/board
 * Quadro com os pedidos agrupados por etapa. ?incluir_reprovados=true inclui também os reprovados.
 */
exports.board = async (req, res) => {
  return res.json(successResponse(await triageService.board({ incluirReprovados: req.query.incluir_reprovados === 'true' })));
};

/*
 * getById — GET /api/v1/adoption-requests/:id
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await triageService.getById(req.params.id)));
};

/*
 * reveal — POST /api/v1/adoption-requests/:id/reveal
 * Contatos completos do adotante do pedido (auditado).
 */
exports.reveal = async (req, res) => {
  return res.json(successResponse(await triageService.reveal(req.params.id, auditContext(req))));
};

/*
 * update — PATCH /api/v1/adoption-requests/:id
 * Altera etapa, prioridade, responsável, anotações etc.
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await triageService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * approve — POST /api/v1/adoption-requests/:id/approve
 */
exports.approve = async (req, res) => {
  return res.json(successResponse(await triageService.approve(req.params.id, req.body, auditContext(req))));
};

/*
 * reject — POST /api/v1/adoption-requests/:id/reject
 */
exports.reject = async (req, res) => {
  return res.json(successResponse(await triageService.reject(req.params.id, req.body, auditContext(req))));
};

/*
 * schedule — POST /api/v1/adoption-requests/:id/schedule
 * Agenda uma visita ou entrevista.
 */
exports.schedule = async (req, res) => {
  return res.json(successResponse(await triageService.schedule(req.params.id, req.body, auditContext(req))));
};

/*
 * reschedule — PATCH /api/v1/adoption-requests/:id/appointments/:appointmentId
 */
exports.reschedule = async (req, res) => {
  return res.json(successResponse(await triageService.reschedule(req.params.id, req.params.appointmentId, req.body, auditContext(req))));
};

/*
 * cancelAppointment — POST /api/v1/adoption-requests/:id/appointments/:appointmentId/cancel
 */
exports.cancelAppointment = async (req, res) => {
  return res.json(successResponse(await triageService.cancelAppointment(req.params.id, req.params.appointmentId, req.body, auditContext(req))));
};

/*
 * completeAppointment — POST /api/v1/adoption-requests/:id/appointments/:appointmentId/complete
 */
exports.completeAppointment = async (req, res) => {
  return res.json(successResponse(await triageService.completeAppointment(req.params.id, req.params.appointmentId, auditContext(req))));
};

/*
 * markTermSigned — POST /api/v1/adoption-requests/:id/term-signed
 * Registra que o Termo de Adoção foi assinado.
 */
exports.markTermSigned = async (req, res) => {
  return res.json(successResponse(await triageService.markTermSigned(req.params.id, auditContext(req))));
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada rota protegida da triagem chama uma destas funções, que repassa id(s),
 *   corpo e autor ao triage-service e devolve o resultado no formato padrão.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Controllers finos e rotas de "ação" (POST /approve, /reject, /cancel...).
 *   - Parâmetros de rota múltiplos (:id e :appointmentId).
 *   - Query string booleana (incluir_reprovados=true).
 * ============================================================================
 */
