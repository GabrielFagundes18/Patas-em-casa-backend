/*
 * ============================================================================
 * ARQUIVO: animal-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER do cadastro de ANIMAIS no painel: listar, exportar CSV, ver
 *   detalhes, criar, editar, mudar status, excluir e gerenciar fotos. Cada
 *   função traduz a requisição HTTP numa chamada ao animal-service e devolve a
 *   resposta no formato padrão.
 *
 * PRINCIPAIS ITENS:
 *   - EXPORT_COLUMNS: colunas da planilha exportada.
 *   - list, exportCsv, getById, create, update, updateStatus, remove,
 *     addPhotos, setPrincipalPhoto, removePhoto.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./animal-service (regras), ../audit/audit-service (auditContext).
 *   - utils/csv, utils/http-response, utils/pagination.
 *   - Usado por: ./animal-routes.js.
 * ============================================================================
 */

// Regras de negócio dos animais.
const animalService = require('./animal-service');
// Extrai o autor da ação (para auditoria).
const { auditContext } = require('../audit/audit-service');
// Ferramentas de CSV.
const { formatDecimal, sendCsv, toCsv } = require('../../utils/csv');
// Formatos de resposta.
const { listResponse, successResponse } = require('../../utils/http-response');
// Paginação.
const { parsePagination } = require('../../utils/pagination');

// Colunas da exportação: "key" lê direto da linha; "value" calcula o texto a partir da linha.
const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'nome', label: 'Nome' },
  { key: 'especie', label: 'Espécie' },
  { key: 'raca', label: 'Raça' },
  { key: 'sexo', label: 'Sexo' },
  // Idade com vírgula decimal (ex.: "1,50").
  { label: 'Idade (anos)', value: (row) => formatDecimal(row.idade_anos) },
  { key: 'porte', label: 'Porte' },
  { key: 'status', label: 'Status' },
  // Booleanos viram "sim"/"não".
  { label: 'Castrado', value: (row) => (row.castrado ? 'sim' : 'não') },
  { label: 'Vacinado', value: (row) => (row.vacinado ? 'sim' : 'não') },
  { key: 'data_entrada', label: 'Data de entrada' },
];

/*
 * list — GET /api/v1/animals
 * Lista paginada com filtros (req.query). Retorno: { data, meta }.
 */
exports.list = async (req, res) => {
  const { items, total } = await animalService.list(req.query);
  const { page, pageSize } = parsePagination(req.query);
  return res.json(listResponse(items, total, page, pageSize));
};

/*
 * exportCsv — GET /api/v1/animals/export
 * Gera o CSV com os mesmos filtros da lista. Nome do arquivo com a data de hoje (AAAA-MM-DD).
 */
exports.exportCsv = async (req, res) => {
  const rows = await animalService.listForExport(req.query);
  return sendCsv(res, `animais-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(EXPORT_COLUMNS, rows));
};

/*
 * getById — GET /api/v1/animals/:id
 * Detalhes completos de um animal (com fotos).
 */
exports.getById = async (req, res) => {
  return res.json(successResponse(await animalService.getDetail(req.params.id)));
};

/*
 * create — POST /api/v1/animals
 * Cadastra um animal (com auditoria). Retorno: 201.
 */
exports.create = async (req, res) => {
  return res.status(201).json(successResponse(await animalService.create(req.body, auditContext(req))));
};

/*
 * update — PUT /api/v1/animals/:id
 * Atualiza os dados do animal.
 */
exports.update = async (req, res) => {
  return res.json(successResponse(await animalService.update(req.params.id, req.body, auditContext(req))));
};

/*
 * updateStatus — PATCH /api/v1/animals/:id/status
 * Muda só o status (com motivo, quando exigido pelas regras de transição).
 */
exports.updateStatus = async (req, res) => {
  // Pega só os campos esperados do corpo.
  const { status, motivo } = req.body;
  return res.json(successResponse(await animalService.changeStatus(req.params.id, { status, motivo }, auditContext(req))));
};

/*
 * remove — DELETE /api/v1/animals/:id
 * Exclui o animal. Retorno: 204 (sem corpo).
 */
exports.remove = async (req, res) => {
  await animalService.remove(req.params.id, auditContext(req));
  return res.status(204).end();
};

/*
 * addPhotos — POST /api/v1/animals/:id/photos
 * Recebe as fotos (req.files, preenchido pelo multer) e as adiciona à galeria. Retorno: 201.
 */
exports.addPhotos = async (req, res) => {
  return res.status(201).json(successResponse(await animalService.addPhotos(req.params.id, req.files, auditContext(req))));
};

/*
 * setPrincipalPhoto — PATCH /api/v1/animals/:id/photos/:photoId/principal
 * Define qual foto aparece como principal (capa).
 */
exports.setPrincipalPhoto = async (req, res) => {
  return res.json(successResponse(await animalService.setPrincipalPhoto(req.params.id, req.params.photoId, auditContext(req))));
};

/*
 * removePhoto — DELETE /api/v1/animals/:id/photos/:photoId
 * Remove uma foto da galeria e devolve o animal atualizado.
 */
exports.removePhoto = async (req, res) => {
  return res.json(successResponse(await animalService.removePhoto(req.params.id, req.params.photoId, auditContext(req))));
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas (já com login, permissão e validação) chamam estas funções. Cada uma
 *   repassa params/query/body (e o autor, para auditoria) ao service e devolve
 *   200, 201 ou 204. A exportação monta o CSV com EXPORT_COLUMNS.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - CRUD (Create, Read, Update, Delete) em uma API REST.
 *   - Métodos HTTP: GET, POST, PUT, PATCH e DELETE.
 *   - Exportação de dados em CSV.
 *   - Contexto de auditoria passado do controller para o service.
 * ============================================================================
 */
