/*
 * ============================================================================
 * ARQUIVO: audit-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE da AUDITORIA. Recebe a descrição de uma ação sensível, limpa os
 *   dados (ids precisam ser UUID) e grava no banco — ou, se a tabela de
 *   auditoria ainda não existir, registra no log. Também extrai da requisição
 *   quem é o autor da ação (auditContext).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - auditContext(req): { userId, role, name, ip, userAgent } (exportada).
 *   - createAuditService(deps): cria o service com record() (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../utils/logger, ./audit-repository, ../../utils/validators (UUID_PATTERN).
 *   - Usado por: controllers e services que fazem ações sensíveis (auth, adotantes,
 *     adoções, animais, doações, equipe, voluntários, histórias...).
 * ============================================================================
 */

// Logs (plano B quando a tabela não existe).
const logger = require('../../utils/logger');
// Banco.
const auditRepository = require('./audit-repository');
// Padrão de UUID (para validar os ids).
const { UUID_PATTERN } = require('../../utils/validators');

/*
 * FUNÇÃO: auditContext (exportada)
 * O que faz: monta o "autor" da ação a partir da requisição.
 * Parâmetros: req (requisição do Express, com req.user preenchido pelo requireAuth).
 * Retorno: { userId, role, name, ip, userAgent } — null nos campos ausentes.
 * Obs.: "req.get?.(...)" chama req.get só se ele existir (útil em testes com objetos falsos).
 */
// Extrai de req o contexto do autor da ação (usuário, cargo, IP e navegador).
function auditContext(req) {
  return {
    userId: req.user?.sub || null,
    role: req.user?.role || null,
    name: req.user?.nome || null,
    ip: req.ip || null,
    userAgent: req.get?.('user-agent')?.slice(0, 500) || null,
  };
}

/*
 * FUNÇÃO: createAuditService (fábrica)
 * Parâmetros (opcionais): { repository, log }.
 * Retorno: { record }.
 */
function createAuditService({ repository = auditRepository, log = logger } = {}) {
  /*
   * FUNÇÃO INTERNA: record (async)
   * O que faz: registra um evento.
   * Parâmetros:
   *   - event: { actor (de auditContext), action, module, entity?, entityId?, before?, after? }.
   *   - db (opcional): client da transação em andamento.
   * Retorno: nada.
   */
  // Registra um evento sensível. Recebe o cliente da transação (db) quando a ação é transacional,
  // para que ação e auditoria sejam gravadas juntas ou desfeitas juntas.
  async function record(event, db) {
    // Normaliza os dados; ids que não são UUID viram null (a coluna do banco é do tipo uuid).
    const entry = {
      userId: UUID_PATTERN.test(String(event.actor?.userId)) ? event.actor.userId : null,
      role: event.actor?.role || null,
      ip: event.actor?.ip || null,
      userAgent: event.actor?.userAgent || null,
      action: event.action,
      module: event.module,
      entity: event.entity || null,
      entityId: UUID_PATTERN.test(String(event.entityId)) ? event.entityId : null,
      before: event.before,
      after: event.after,
    };

    // Tabela existe: grava no banco e termina.
    if (await repository.isAvailable(db)) {
      await repository.insert(db, entry);
      return;
    }

    // Tabela ainda não existe: registra no log só os campos técnicos permitidos
    // ("|| undefined" faz o logger ignorar campos vazios).
    log.info('audit_event', {
      userId: entry.userId || undefined,
      action: entry.action,
      module: entry.module,
      entity: entry.entity || undefined,
      entityId: entry.entityId || undefined,
    });
  }

  return { record };
}

// Exporta uma instância pronta (record), a fábrica e auditContext.
module.exports = { ...createAuditService(), createAuditService, auditContext };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O controller chama auditService.record({ actor: auditContext(req), action, ... }, db?).
 *   O service normaliza os dados e grava no banco (na mesma transação, se houver)
 *   ou, sem a tabela, escreve um log "audit_event".
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Auditoria e LGPD (rastrear acesso a dados pessoais).
 *   - Gravar a auditoria na mesma transação da ação (tudo ou nada).
 *   - Encadeamento opcional com chamada de função (obj.metodo?.()).
 *   - Degradação graciosa (funcionar mesmo sem a tabela).
 * ============================================================================
 */
