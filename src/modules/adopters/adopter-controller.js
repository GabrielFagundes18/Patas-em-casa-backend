/*
 * ============================================================================
 * ARQUIVO: adopter-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER dos ADOTANTES no painel: listar, exportar CSV, ver detalhes,
 *   revelar contatos (dado pessoal completo), editar e as ações da LGPD
 *   (exportar todos os dados do titular, anonimizar e excluir).
 *
 * PRINCIPAIS ITENS:
 *   - EXPORT_COLUMNS: colunas do CSV.
 *   - list, exportCsv, getById, reveal, update, exportTitularData, anonymize, remove.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./adopter-service, ../audit/audit-service (auditContext), config/permissions.
 *   - utils/csv, utils/http-response, utils/pagination.
 *   - Usado por: ./adopter-routes.js.
 * ============================================================================
 */

// Regras de negócio dos adotantes.
const adopterService = require('./adopter-service');
// Autor da ação (auditoria).
const { auditContext } = require('../audit/audit-service');
// Verificação de permissão.
const { hasPermission } = require('../../config/permissions');
// CSV.
const { sendCsv, toCsv } = require('../../utils/csv');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

// Colunas da exportação.
const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'nome', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'UF' },
  { key: 'status', label: 'Status' },
  { key: 'total_pedidos', label: 'Pedidos' },
  { key: 'pedidos_abertos', label: 'Pedidos em andamento' },
  // Data de cadastro no formato AAAA-MM-DD.
  { label: 'Cadastro', value: (row) => new Date(row.criado_em).toISOString().slice(0, 10) },
];

/*
 * list — GET /api/v1/adopters
 * Lista paginada (contatos mascarados).
 */
exports.list = async (req, res) => {
  const { items, total } = await adopterService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * exportCsv — GET /api/v1/adopters/export
 * Contatos completos só para quem também tem "adopters:reveal"; para os demais, saem mascarados.
 */
exports.exportCsv = async (req, res) => {
  const revealContacts = hasPermission(req.user.role, 'adopters:reveal');
  const rows = await adopterService.listForExport(req.query, { revealContacts }, auditContext(req));
  return sendCsv(res, `adotantes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
};

/*
 * getById — GET /api/v1/adopters/:id
 * Detalhes com histórico (pedidos, doações, histórias), dados mascarados.
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await adopterService.getById(req.params.id)));
};

/*
 * reveal — POST /api/v1/adopters/:id/reveal
 * Devolve e-mail, telefone e endereço completos (fica registrado na auditoria).
 * POST, e não GET, porque é uma ação com efeito (gera registro de auditoria).
 */
exports.reveal = async (req, res) => {
  return res.json(successResponse(await adopterService.reveal(req.params.id, auditContext(req))));
};

/*
 * update — PATCH /api/v1/adopters/:id
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await adopterService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * exportTitularData — GET /api/v1/adopters/:id/lgpd-export
 * Baixa um JSON com TODOS os dados do titular (direito de acesso/portabilidade da LGPD).
 * Content-Disposition "attachment" faz o navegador salvar como arquivo.
 */
exports.exportTitularData = async (req, res) => {
  const data = await adopterService.exportTitularData(req.params.id, auditContext(req));
  res.setHeader('Content-Disposition', `attachment; filename="dados-titular-${req.params.id}.json"`);
  return res.json(successResponse(data));
};

/*
 * anonymize — POST /api/v1/adopters/:id/anonymize
 * Remove a identificação do titular, mantendo os registros (irreversível).
 */
exports.anonymize = async (req, res) => {
  return res.json(successResponse(await adopterService.anonymize(req.params.id, auditContext(req))));
};

/*
 * remove — DELETE /api/v1/adopters/:id
 * Exclui o titular (irreversível). Retorno: 204.
 */
exports.remove = async (req, res) => {
  await adopterService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas (com login, permissão e validação) chamam estas funções, que
 *   repassam ao adopter-service. Leituras mostram dados mascarados; revelar,
 *   exportar e as ações LGPD passam o autor (auditContext) para auditoria.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - LGPD: direitos do titular (acesso, portabilidade, anonimização, exclusão).
 *   - Permissão "extra" que muda o resultado (reveal no CSV).
 *   - Download de arquivo com Content-Disposition.
 * ============================================================================
 */
