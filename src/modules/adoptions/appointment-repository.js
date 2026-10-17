/*
 * ============================================================================
 * ARQUIVO: appointment-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY da AGENDA de visitas e entrevistas dos pedidos de adoção
 *   (tabela pedidos_adocao_agendamentos). Além de criar, buscar e atualizar
 *   compromissos, detecta CONFLITOS DE HORÁRIO do mesmo responsável e usa uma
 *   "trava de agenda" para que dois agendamentos simultâneos não passem juntos.
 *
 * PRINCIPAIS ITENS:
 *   - SELECT_APPOINTMENT (SQL base), UPDATABLE_COLUMNS.
 *   - lockSchedule, findConflicts, create, findById, update, listForRequest,
 *     countActiveVisits, cancelActiveForRequest.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - db/pool, db/sql (buildUpdate).
 *   - Tabelas: pedidos_adocao_agendamentos (migration 011), pedidos_adocao, adotantes, usuarios.
 *   - Usado por: ./adoption-triage-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');
// Montador de UPDATE parcial.
const { buildUpdate } = require('../../db/sql');

// Agenda de visitas e entrevistas dos pedidos de adoção (migration 011).
// SQL base: dados do compromisso + nome do responsável (LEFT JOIN: o responsável é opcional).
const SELECT_APPOINTMENT = `
  SELECT ag.id, ag.pedido_id, ag.tipo, ag.status, ag.previsto_em, ag.duracao_minutos, ag.local, ag.mensagem,
         ag.responsavel_id, u.nome AS responsavel_nome, ag.criado_em, ag.atualizado_em
  FROM pedidos_adocao_agendamentos ag
  LEFT JOIN usuarios u ON u.id = ag.responsavel_id`;

// Colunas alteráveis de um compromisso.
const UPDATABLE_COLUMNS = new Set(['status', 'previsto_em', 'duracao_minutos', 'local', 'mensagem']);

/*
 * FUNÇÃO: lockSchedule (async)
 * O que faz: pega uma "trava consultiva" (advisory lock) do PostgreSQL que dura até o fim da transação.
 *   Enquanto uma transação segura a trava, outra que pedir a mesma trava ESPERA.
 * Detalhe: hashtext('patas_agenda_adocao') transforma o nome num número (a "chave" da trava).
 */
// Trava de agenda até o fim da transação: dois agendamentos simultâneos não passam juntos pela
// verificação de conflito.
async function lockSchedule(db) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('patas_agenda_adocao'))");
}

/*
 * FUNÇÃO: findConflicts (async)
 * O que faz: procura compromissos AGENDADOS do mesmo responsável que se sobrepõem ao novo horário.
 * Parâmetros: { responsavelId, inicio (Date), duracaoMinutos, excludeId (compromisso a ignorar, na remarcação) }.
 * Retorno (array com no máximo 1 conflito).
 * Lógica de sobreposição de intervalos [A, A+dA) e [B, B+dB): existe conflito se A < B+dB E A+dA > B.
 *   make_interval(mins => n) cria um intervalo de n minutos.
 */
// Compromissos ativos do mesmo responsável que se sobrepõem a [inicio, inicio + duração).
async function findConflicts(db, { responsavelId, inicio, duracaoMinutos, excludeId = null }) {
  const result = await db.query(
    `SELECT ag.id, ag.tipo, ag.previsto_em, u.nome AS responsavel_nome, d.nome AS adotante_nome
     FROM pedidos_adocao_agendamentos ag
     JOIN pedidos_adocao p ON p.id = ag.pedido_id
     JOIN adotantes d ON d.id = p.adotante_id
     LEFT JOIN usuarios u ON u.id = ag.responsavel_id
     WHERE ag.status = 'agendado'
       AND ag.responsavel_id = $1
       AND ag.previsto_em < $2::timestamptz + make_interval(mins => $3)
       AND ag.previsto_em + make_interval(mins => ag.duracao_minutos) > $2::timestamptz
       AND ($4::uuid IS NULL OR ag.id <> $4::uuid)
     ORDER BY ag.previsto_em
     LIMIT 1`,
    [responsavelId, inicio, duracaoMinutos, excludeId]
  );
  return result.rows;
}

/*
 * FUNÇÃO: create (async)
 * O que faz: cria o compromisso e devolve a versão completa (com o nome do responsável).
 */
async function create(db, { pedidoId, tipo, previstoEm, duracaoMinutos, local, mensagem, responsavelId }) {
  const result = await db.query(
    `INSERT INTO pedidos_adocao_agendamentos (pedido_id, tipo, previsto_em, duracao_minutos, local, mensagem, responsavel_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [pedidoId, tipo, previstoEm, duracaoMinutos, local || null, mensagem || null, responsavelId || null]
  );
  return findById(db, result.rows[0].id);
}

/*
 * FUNÇÃO: findById (async)
 * O que faz: busca um compromisso; com forUpdate, trava a linha (só da tabela "ag").
 */
async function findById(db = pool, id, { forUpdate = false } = {}) {
  const result = await db.query(
    `${SELECT_APPOINTMENT} WHERE ag.id = $1 ${forUpdate ? 'FOR UPDATE OF ag' : ''}`,
    [id]
  );
  return result.rows[0] || null;
}

/*
 * FUNÇÃO: update (async)
 * O que faz: altera as colunas permitidas (se houver) e devolve o compromisso atualizado.
 */
async function update(db, id, changes) {
  const update = buildUpdate(changes, UPDATABLE_COLUMNS, id);
  if (update) await db.query(`UPDATE pedidos_adocao_agendamentos SET ${update.set} WHERE id = ${update.idParam}`, update.values);
  return findById(db, id);
}

/*
 * FUNÇÃO: listForRequest (async)
 * O que faz: lista os compromissos de um pedido, do mais recente para o mais antigo.
 */
async function listForRequest(db = pool, pedidoId) {
  const result = await db.query(`${SELECT_APPOINTMENT} WHERE ag.pedido_id = $1 ORDER BY ag.previsto_em DESC`, [pedidoId]);
  return result.rows;
}

/*
 * FUNÇÃO: countActiveVisits (async)
 * O que faz: conta as VISITAS ainda agendadas do pedido (usado para decidir a etapa do pedido).
 */
async function countActiveVisits(db, pedidoId) {
  const result = await db.query(
    "SELECT COUNT(*)::int AS total FROM pedidos_adocao_agendamentos WHERE pedido_id = $1 AND tipo = 'visita' AND status = 'agendado'",
    [pedidoId]
  );
  return result.rows[0].total;
}

/*
 * FUNÇÃO: cancelActiveForRequest (async)
 * O que faz: cancela todos os compromissos ainda agendados do pedido.
 * Retorno (number): quantos foram cancelados.
 */
// Pedido encerrado (reprovado) não deixa compromisso pendurado na agenda.
async function cancelActiveForRequest(db, pedidoId) {
  const result = await db.query(
    "UPDATE pedidos_adocao_agendamentos SET status = 'cancelado' WHERE pedido_id = $1 AND status = 'agendado'",
    [pedidoId]
  );
  return result.rowCount;
}

// Exporta as funções.
module.exports = {
  lockSchedule,
  findConflicts,
  create,
  findById,
  update,
  listForRequest,
  countActiveVisits,
  cancelActiveForRequest,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Para agendar/remarcar, o service abre uma transação → lockSchedule (fila única
 *   para a agenda) → findConflicts (sobreposição de horário do responsável) →
 *   create/update. Ao reprovar um pedido, cancelActiveForRequest limpa a agenda.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Advisory locks do PostgreSQL (pg_advisory_xact_lock).
 *   - Detecção de sobreposição de intervalos de tempo.
 *   - timestamptz, make_interval e conversões de tipo (::uuid, ::timestamptz).
 *   - FOR UPDATE OF tabela (travar só uma das tabelas do JOIN).
 * ============================================================================
 */
