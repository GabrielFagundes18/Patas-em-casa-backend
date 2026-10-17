/*
 * ============================================================================
 * ARQUIVO: audit-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY da AUDITORIA: grava na tabela "auditoria_eventos" quem fez cada
 *   ação sensível (revelar dado pessoal, aprovar adoção, excluir, trocar senha...),
 *   quando, de onde (IP/navegador) e como estavam os dados antes e depois.
 *   Essa tabela vem da migration 001 (ainda uma proposta); por isso o arquivo
 *   primeiro verifica se a tabela existe.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - isAvailable(db): a tabela de auditoria existe?
 *   - insert(db, event): grava um evento.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/pool. Tabela auditoria_eventos (migrations/001-seguranca-acesso.sql).
 *   - Usado por: ./audit-service.js.
 * ============================================================================
 */

// Pool de conexões.
const pool = require('../../db/pool');

// Se a tabela não existir, só pergunta de novo depois de 1 minuto (evita consultar o banco toda hora).
const UNAVAILABLE_RECHECK_MS = 60000;
// Memória (cache) do resultado da verificação.
let tableAvailable = false;
// Quando foi a última verificação.
let checkedAt = 0;

/*
 * FUNÇÃO: isAvailable (async)
 * O que faz: diz se a tabela auditoria_eventos existe.
 * Parâmetros: db (opcional, padrão pool).
 * Retorno (boolean). Depois que a resposta é "sim", não consulta mais o banco.
 */
// A tabela vem da migração 001; enquanto ela não for aplicada, a disponibilidade é
// reconsultada a cada minuto, então aplicar a migração ativa a gravação sem reiniciar.
async function isAvailable(db = pool) {
  // Já sabemos que existe.
  if (tableAvailable) return true;
  // Verificamos há menos de 1 minuto e não existia: responde "não" sem consultar.
  if (Date.now() - checkedAt < UNAVAILABLE_RECHECK_MS) return false;

  // to_regclass('nome') devolve a tabela se ela existir, ou NULL se não existir.
  const result = await db.query("SELECT to_regclass('public.auditoria_eventos') IS NOT NULL AS available");
  tableAvailable = result.rows[0].available;
  checkedAt = Date.now();
  return tableAvailable;
}

/*
 * FUNÇÃO: insert (async)
 * O que faz: grava um evento de auditoria.
 * Parâmetros:
 *   - db (padrão pool; ou o client da transação, para gravar junto com a ação).
 *   - event: { userId, role, action, module, entity, entityId, ip, userAgent, before, after }.
 * Retorno: nada.
 */
async function insert(db = pool, event) {
  await db.query(
    `INSERT INTO auditoria_eventos
      (usuario_id, cargo, acao, modulo, entidade, entidade_id, ip, agente_usuario, valores_antes, valores_depois)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.userId,
      event.role,
      event.action,
      event.module,
      event.entity,
      event.entityId,
      event.ip,
      event.userAgent,
      // "Antes" e "depois" são guardados como texto JSON (ou NULL se não informados).
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
    ]
  );
}

// Exporta as duas funções.
module.exports = { isAvailable, insert };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O audit-service pergunta isAvailable(); se a tabela existir, chama insert()
 *   com os dados do evento; se não, registra o evento só no log.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Trilhas de auditoria (quem, o quê, quando, onde, antes/depois).
 *   - Cache simples em variáveis do módulo (estado que dura enquanto o processo roda).
 *   - to_regclass no PostgreSQL e JSON.stringify para colunas JSON.
 *   - Funcionalidades que "acordam" sozinhas quando a migração é aplicada.
 * ============================================================================
 */
