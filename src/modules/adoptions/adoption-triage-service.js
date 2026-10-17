/*
 * ============================================================================
 * ARQUIVO: adoption-triage-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE da TRIAGEM DE PEDIDOS DE ADOÇÃO no painel — o arquivo com mais
 *   regras de negócio do backend. Cuida de:
 *     - listar pedidos e montar o quadro (board) por etapa;
 *     - ver detalhes (com contatos mascarados) e revelar contatos (auditado);
 *     - editar etapa, prioridade, responsável e anotações (histórico);
 *     - APROVAR (animal vira "adotado", adotante vira "adotante" e os outros
 *       pedidos do mesmo animal são reprovados automaticamente) e REPROVAR;
 *     - AGENDA: agendar, remarcar, cancelar e concluir visitas/entrevistas,
 *       com verificação de conflito de horário do responsável;
 *     - marcar o Termo de Adoção como assinado;
 *     - avisar o adotante por e-mail (sempre DEPOIS de gravar a ação).
 *   Quase tudo roda dentro de transações com travas (FOR UPDATE), para que duas
 *   pessoas agindo ao mesmo tempo não deixem os dados inconsistentes.
 *
 * PRINCIPAIS ITENS:
 *   - Constantes: OPEN_STATUSES, APPOINTMENT_LABELS, DEFAULT_APPOINTMENT_MINUTES,
 *     BOARD_COLUMN_LIMIT, noteDateFormatter.
 *   - Funções auxiliares: notFound, alreadyDecided, appendNote, toSummary,
 *     toAppointment, toDetail, describeDate.
 *   - createAdoptionTriageService(repository, deps): fábrica do service (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils: app-error, brasilia-time, logger, masking, pagination; db/transaction.
 *   - config: domain-values, permissions.
 *   - ./adoption-triage-repository, ./appointment-repository, ../audit/audit-service.
 *   - integrations/email: mailer e adoption-emails.
 *   - Usado por: ./adoption-request-controller.js.
 *   - Testado em: tests/unit/adoption-triage-service.test.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Valores dos pedidos (status, prioridades...).
const { adoptionRequest } = require('../../config/domain-values');
// Verificação de permissão (para validar o responsável escolhido).
const { hasPermission } = require('../../config/permissions');
// Datas/horas de Brasília.
const { describeBrasiliaDateTime, parseBrasiliaDateTime, toBrasiliaDateTime } = require('../../utils/brasilia-time');
// Logs.
const logger = require('../../utils/logger');
// Mascaramento de dados pessoais.
const { maskContactsInText, maskEmail, maskPhone } = require('../../utils/masking');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Transações.
const withTransaction = require('../../db/transaction');
// Banco: pedidos e agenda.
const triageRepository = require('./adoption-triage-repository');
const appointmentRepository = require('./appointment-repository');
// Auditoria.
const auditService = require('../audit/audit-service');
// Envio de e-mails.
const defaultMailer = require('../../integrations/email/mailer');
// Modelos de e-mail ao adotante.
const {
  buildAppointmentCancelledEmail,
  buildAppointmentEmail,
  buildAppointmentRescheduledEmail,
  buildDecisionEmail,
} = require('../../integrations/email/adoption-emails');

// Etapas "em aberto" (novo, em_analise, visita_agendada).
const OPEN_STATUSES = adoptionRequest.openStatus;
// Nome de cada tipo de compromisso para textos.
const APPOINTMENT_LABELS = { visita: 'Visita', entrevista: 'Entrevista' };
// Duração padrão de um compromisso.
const DEFAULT_APPOINTMENT_MINUTES = 60;
// Máximo de cartões por coluna no quadro.
const BOARD_COLUMN_LIMIT = 50;
// Formata data e hora curtas no fuso de Brasília (ex.: "16/10/2026, 14:30") para as anotações.
const noteDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

// Erro 404: pedido não encontrado.
function notFound() {
  return new AppError(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido de adoção não encontrado.');
}

// Erro 409: o pedido já foi aprovado/reprovado.
function alreadyDecided() {
  return new AppError(409, 'PEDIDO_ENCERRADO', 'Este pedido já foi decidido; só é possível adicionar anotações.');
}

/*
 * FUNÇÃO: appendNote
 * O que faz: acrescenta uma anotação ao histórico (campo "observacoes") do pedido.
 * Parâmetros: existing (texto atual ou null), author (nome), text (anotação), date (Date).
 * Retorno (string): o histórico com a nova entrada "[data — autor] texto" no fim,
 *   separada por uma linha em branco.
 */
// Anotações ficam no histórico do pedido com data, hora e autor.
function appendNote(existing, author, text, date) {
  const entry = `[${noteDateFormatter.format(date)} — ${author}] ${text.trim()}`;
  return existing ? `${existing}\n\n${entry}` : entry;
}

/*
 * FUNÇÃO: toSummary
 * O que faz: converte a linha "achatada" do banco (animal_nome, adotante_email...) num objeto
 *   organizado { animal: {...}, adotante: {...}, responsavel: {...} }, com contatos mascarados.
 */
// Contatos do adotante saem mascarados; o valor completo exige o endpoint de revelar (auditado).
function toSummary(row) {
  return {
    id: row.id,
    status: row.status,
    prioridade: row.prioridade,
    termo_assinado: row.termo_assinado,
    termo_assinado_em: row.termo_assinado_em,
    data_pedido: row.data_pedido,
    atualizado_em: row.atualizado_em,
    animal: {
      id: row.animal_id,
      nome: row.animal_nome,
      especie: row.animal_especie,
      status: row.animal_status,
      foto_url: row.animal_foto_url,
    },
    adotante: {
      id: row.adotante_id,
      nome: row.adotante_nome,
      cidade: row.adotante_cidade,
      estado: row.adotante_estado,
      status: row.adotante_status,
      email: maskEmail(row.adotante_email),
      telefone: maskPhone(row.adotante_telefone),
    },
    // Responsável só se houver.
    responsavel: row.responsavel_id ? { id: row.responsavel_id, nome: row.responsavel_nome } : null,
  };
}

/*
 * FUNÇÃO: toAppointment
 * O que faz: formato de um compromisso para a API; "data_hora" vem no formato do campo
 *   datetime-local do painel (AAAA-MM-DDTHH:mm, horário de Brasília).
 */
function toAppointment(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    previsto_em: row.previsto_em,
    data_hora: toBrasiliaDateTime(row.previsto_em),
    duracao_minutos: row.duracao_minutos,
    local: row.local,
    mensagem: row.mensagem,
    responsavel: row.responsavel_id ? { id: row.responsavel_id, nome: row.responsavel_nome } : null,
  };
}

/*
 * FUNÇÃO: toDetail
 * O que faz: resumo + histórico (mascarado) + data preferida + lista de compromissos.
 */
function toDetail(row, agendamentos = []) {
  return {
    ...toSummary(row),
    observacoes: maskContactsInText(row.observacoes),
    visita_preferida_em: row.visita_preferida_em ? toBrasiliaDateTime(row.visita_preferida_em) : null,
    agendamentos: agendamentos.map(toAppointment),
  };
}

/*
 * FUNÇÃO: describeDate
 * O que faz: Date → { diaSemana, data, hora } em Brasília (para textos).
 */
function describeDate(date) {
  return describeBrasiliaDateTime(toBrasiliaDateTime(date));
}

/*
 * FUNÇÃO: createAdoptionTriageService (fábrica)
 * Parâmetros:
 *   - repository (padrão triageRepository).
 *   - deps (opcionais): audit, transaction, now (relógio), mailer, log, appointments.
 * Retorno: objeto com as operações listadas no "return" do fim.
 */
function createAdoptionTriageService(repository = triageRepository, {
  audit = auditService,
  transaction = withTransaction,
  now = () => new Date(),
  mailer = defaultMailer,
  log = logger,
  appointments = appointmentRepository,
} = {}) {
  // Carrega o detalhe completo (pedido + compromissos) usando a conexão informada.
  async function loadDetail(db, id) {
    const row = await repository.findById(db, id);
    return toDetail(row, await appointments.listForRequest(db, id));
  }

  // Busca o pedido (fora de transação) ou lança 404.
  async function findRequest(id) {
    const request = await repository.findById(undefined, id);
    if (!request) throw notFound();
    return request;
  }

  // Trava a linha do pedido (FOR UPDATE) até o fim da transação: duas ações simultâneas não se sobrepõem.
  async function lockRequest(db, id) {
    const request = await repository.findById(db, id, { forUpdate: true });
    if (!request) throw notFound();
    return request;
  }

  // Trava o pedido e exige que ele ainda esteja em aberto (senão, 409).
  async function lockOpenRequest(db, id) {
    const request = await lockRequest(db, id);
    if (!OPEN_STATUSES.includes(request.status)) throw alreadyDecided();
    return request;
  }

  /*
   * releaseAdopter: se o adotante estava "em análise"/"visita agendada" e não tem mais nenhum
   * outro pedido aberto, volta para "inativo".
   */
  // Sem outros pedidos abertos, o candidato deixa de estar "em análise".
  async function releaseAdopter(db, request) {
    if (!['em_analise', 'visita_agendada'].includes(request.adotante_status)) return;
    const openRequests = await repository.countOpenRequestsForAdopter(db, request.adotante_id, request.id);
    if (openRequests === 0) await repository.setAdopterStatus(db, request.adotante_id, 'inativo');
  }

  /*
   * list: lista paginada com filtros convertidos da query string.
   *   - status "a,b" vira ['a', 'b'];
   *   - responsavel_id "nenhum" vira o filtro semResponsavel.
   */
  async function list(query = {}) {
    const { items, total } = await repository.list({
      ...parsePagination(query),
      status: query.status ? String(query.status).split(',') : undefined,
      prioridade: query.prioridade,
      responsavelId: query.responsavel_id && query.responsavel_id !== 'nenhum' ? query.responsavel_id : undefined,
      semResponsavel: query.responsavel_id === 'nenhum',
      animalId: query.animal_id,
      adotanteId: query.adotante_id,
      q: query.q ? String(query.q).trim() : '',
      de: query.de,
      ate: query.ate,
      sort: query.sort,
      order: query.order?.toLowerCase(),
    });
    return { items: items.map(toSummary), total };
  }

  /*
   * board: monta o quadro estilo "kanban": uma coluna por etapa (até 50 cartões cada),
   * ordenados por prioridade. "reprovado" só entra se incluirReprovados for true.
   * Retorno: { columns: [{ status, total, items }] }.
   */
  async function board({ incluirReprovados = false } = {}) {
    const statuses = incluirReprovados
      ? adoptionRequest.status
      : adoptionRequest.status.filter((status) => status !== 'reprovado');
    const columns = [];

    // Uma consulta por etapa (em sequência, por causa do await dentro do for...of).
    for (const status of statuses) {
      const { items, total } = await repository.list({
        status: [status],
        page: 1,
        pageSize: BOARD_COLUMN_LIMIT,
        offset: 0,
        sort: 'prioridade',
        order: 'asc',
      });
      columns.push({ status, total, items: items.map(toSummary) });
    }

    return { columns };
  }

  /*
   * getById: confere se existe (404) e devolve o detalhe.
   */
  async function getById(id) {
    await findRequest(id);
    return loadDetail(undefined, id);
  }

  /*
   * reveal: devolve e-mail, telefone e observações SEM máscara, registrando na auditoria.
   */
  async function reveal(id, actor = {}) {
    const request = await findRequest(id);

    await audit.record({
      actor,
      action: 'revelar_dados_pedido',
      module: 'adoptions',
      entity: 'pedido_adocao',
      entityId: id,
    });

    return {
      id: request.id,
      adotante: {
        id: request.adotante_id,
        email: request.adotante_email,
        telefone: request.adotante_telefone,
      },
      observacoes: request.observacoes,
    };
  }

  /*
   * update: muda etapa (entre as abertas), prioridade, responsável e/ou acrescenta uma anotação.
   * Pedido já decidido só aceita anotações.
   * Retorno: o detalhe atualizado.
   */
  async function update(id, payload, actor = {}) {
    return transaction(async (db) => {
      // Trava o pedido.
      const current = await lockRequest(db, id);

      // Mexe na triagem (não só anotação)? Então o pedido precisa estar aberto.
      const changesTriage = ['status', 'prioridade', 'responsavel_id'].some((field) => Object.hasOwn(payload, field));
      if (!OPEN_STATUSES.includes(current.status) && changesTriage) throw alreadyDecided();

      // Só entra em "changes" o que for diferente do atual.
      const changes = {};
      if (payload.status !== undefined && payload.status !== current.status) changes.status = payload.status;
      if (payload.prioridade !== undefined && payload.prioridade !== current.prioridade) changes.prioridade = payload.prioridade;

      // Responsável: null remove; um id precisa ser de usuário ativo com permissão adoptions:update.
      if (Object.hasOwn(payload, 'responsavel_id') && payload.responsavel_id !== current.responsavel_id) {
        if (payload.responsavel_id === null) {
          changes.responsavel_id = null;
        } else {
          const responsible = await repository.findActiveUser(db, payload.responsavel_id);
          if (!responsible || !hasPermission(responsible.cargo, 'adoptions:update')) {
            throw new AppError(422, 'RESPONSAVEL_INVALIDO', 'Escolha um usuário ativo da equipe de adoções.', [
              { field: 'responsavel_id', message: 'Usuário inexistente, inativo ou sem acesso às adoções.' },
            ]);
          }
          changes.responsavel_id = responsible.id;
        }
      }

      // Anotação: acrescentada ao histórico com o nome de quem escreveu.
      if (payload.nota) {
        changes.observacoes = appendNote(current.observacoes, actor.name || 'Equipe', payload.nota, now());
      }

      await repository.update(db, id, changes);

      // Mantém o status do adotante coerente com a etapa do pedido:
      // - foi para "visita_agendada" → adotante também (exceto se já for "adotante");
      // - saiu de "visita_agendada" → adotante volta para "em_analise".
      if (changes.status === 'visita_agendada' && current.adotante_status !== 'adotante') {
        await repository.setAdopterStatus(db, current.adotante_id, 'visita_agendada');
      } else if (changes.status && current.status === 'visita_agendada' && current.adotante_status === 'visita_agendada') {
        await repository.setAdopterStatus(db, current.adotante_id, 'em_analise');
      }

      // Auditoria dos campos de triagem alterados (e da anotação, se houver).
      const tracked = ['status', 'prioridade', 'responsavel_id'].filter((field) => Object.hasOwn(changes, field));
      if (tracked.length > 0 || payload.nota) {
        await audit.record({
          actor,
          action: changes.status ? 'mover_pedido' : 'editar',
          module: 'adoptions',
          entity: 'pedido_adocao',
          entityId: id,
          before: Object.fromEntries(tracked.map((field) => [field, current[field]])),
          after: { ...Object.fromEntries(tracked.map((field) => [field, changes[field]])), ...(payload.nota ? { nota: payload.nota } : {}) },
        }, db);
      }

      return loadDetail(db, id);
    });
  }

  /*
   * approve: APROVA o pedido.
   * Na transação: trava pedido (aberto) e animal → confere o animal → pedido "aprovado" com anotação →
   *   animal "adotado" → adotante "adotante" → reprova automaticamente os outros pedidos abertos do
   *   animal (cancelando a agenda deles e liberando os adotantes) → auditoria.
   * Depois da transação: e-mail ao adotante, se pedido.
   */
  async function approve(id, payload, actor = {}) {
    const { justificativa } = payload;
    const detail = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);

      // O animal não pode já estar adotado nem inativo.
      const animal = await repository.lockAnimal(db, current.animal_id);
      if (animal.status === 'adotado') {
        throw new AppError(409, 'ANIMAL_JA_ADOTADO', 'Este animal já foi adotado em outro pedido.');
      }
      if (animal.status === 'inativo') {
        throw new AppError(409, 'ANIMAL_INATIVO', 'Este animal está inativo; reative-o antes de aprovar a adoção.');
      }

      // Mesma data para todas as anotações desta operação.
      const date = now();
      await repository.update(db, id, {
        status: 'aprovado',
        observacoes: appendNote(current.observacoes, actor.name || 'Equipe', `Aprovado. Justificativa: ${justificativa}`, date),
      });
      await repository.setAnimalStatus(db, animal.id, 'adotado');
      await repository.setAdopterStatus(db, current.adotante_id, 'adotante');

      // Os demais pedidos abertos para o mesmo animal são encerrados.
      const otherRequests = await repository.lockOpenRequestsForAnimal(db, animal.id, id);
      for (const other of otherRequests) {
        await repository.update(db, other.id, {
          status: 'reprovado',
          observacoes: appendNote(other.observacoes, 'Sistema', 'Reprovado automaticamente: o animal foi adotado em outro pedido.', date),
        });
        await appointments.cancelActiveForRequest(db, other.id);
        // Rebusca o pedido completo (com o status do adotante) para decidir se libera o adotante.
        const otherRequest = await repository.findById(db, other.id);
        await releaseAdopter(db, otherRequest);
        await audit.record({
          actor,
          action: 'reprovar_automaticamente',
          module: 'adoptions',
          entity: 'pedido_adocao',
          entityId: other.id,
          before: { status: other.status },
          after: { status: 'reprovado', motivo: 'animal adotado em outro pedido' },
        }, db);
      }

      // Auditoria da aprovação (antes x depois de pedido, animal e adotante).
      await audit.record({
        actor,
        action: 'aprovar',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        before: { status: current.status, animal_status: animal.status, adotante_status: current.adotante_status },
        after: { status: 'aprovado', animal_status: 'adotado', adotante_status: 'adotante', justificativa },
      }, db);

      return loadDetail(db, id);
    });

    // true = aprovado.
    return notifyDecision(id, detail, payload, true);
  }

  /*
   * notifyDecision: se notificar_adotante for true, envia o e-mail da decisão e devolve o detalhe
   * recarregado (com a anotação sobre o e-mail) + o resultado do envio. Senão, email: null.
   */
  // A justificativa é interna; o adotante só recebe a mensagem escrita para ele (mensagem_adotante).
  async function notifyDecision(id, detail, payload, aprovado) {
    if (payload.notificar_adotante !== true) return { ...detail, email: null };
    const email = await notifyAdopter(
      id,
      // Função que monta o e-mail a partir do pedido (recebe "request" dentro de notifyAdopter).
      (request) => buildDecisionEmail({
        aprovado,
        mensagem: payload.mensagem_adotante?.trim() || '',
        adotanteNome: request.adotante_nome,
        animalNome: request.animal_nome,
      }),
      aprovado ? 'de aprovação' : 'de resposta ao pedido'
    );
    return { ...(await loadDetail(undefined, id)), email };
  }

  /*
   * reject: REPROVA o pedido.
   * Na transação: trava pedido (aberto) e animal → cancela a agenda do pedido → pedido "reprovado"
   *   com anotação → se o animal estava "em_processo" e não sobrou pedido aberto, volta a "disponivel" →
   *   libera o adotante → auditoria. Depois: e-mail opcional.
   */
  async function reject(id, payload, actor = {}) {
    const { justificativa } = payload;
    const detail = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);

      const animal = await repository.lockAnimal(db, current.animal_id);
      const cancelled = await appointments.cancelActiveForRequest(db, id);
      // A anotação menciona quantos compromissos foram cancelados (se algum).
      const note = `Reprovado. Justificativa: ${justificativa}${cancelled ? ` Agendamentos em aberto cancelados: ${cancelled}.` : ''}`;
      await repository.update(db, id, {
        status: 'reprovado',
        observacoes: appendNote(current.observacoes, actor.name || 'Equipe', note, now()),
      });

      const remaining = await repository.lockOpenRequestsForAnimal(db, animal.id, id);
      const releasesAnimal = animal.status === 'em_processo' && remaining.length === 0;
      if (releasesAnimal) await repository.setAnimalStatus(db, animal.id, 'disponivel');
      await releaseAdopter(db, current);

      await audit.record({
        actor,
        action: 'reprovar',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        before: { status: current.status, animal_status: animal.status },
        after: { status: 'reprovado', animal_status: releasesAnimal ? 'disponivel' : animal.status, justificativa },
      }, db);

      return loadDetail(db, id);
    });

    // false = não aprovado.
    return notifyDecision(id, detail, payload, false);
  }

  /*
   * notifyAdopter: envia um e-mail ao adotante e anota o resultado no histórico do pedido.
   * Parâmetros: id, buildMessage (função que recebe o pedido e devolve { subject, text, html }),
   *   label (texto para a anotação, ex.: 'com o agendamento').
   * Retorno: { enviado: true, para } ou { enviado: false, motivo }. Nunca lança erro de envio.
   */
  // E-mail ao adotante, sempre depois de gravar a ação: se o envio falhar, a ação continua valendo.
  // O resultado vai para o histórico do pedido, para a equipe saber se o adotante foi avisado.
  async function notifyAdopter(id, buildMessage, label) {
    const request = await findRequest(id);
    let email;
    if (!mailer.isConfigured()) {
      email = { enviado: false, motivo: 'O envio de e-mails não está configurado no servidor (SMTP).' };
    } else {
      try {
        await mailer.send({ to: request.adotante_email, ...buildMessage(request) });
        // O endereço volta mascarado para o painel.
        email = { enviado: true, para: maskEmail(request.adotante_email) };
      } catch (error) {
        log.error('email_adotante_falhou', { module: 'adoptions', entityId: id, code: error.code });
        email = { enviado: false, motivo: 'O servidor de e-mail recusou ou não respondeu ao envio.' };
      }
    }

    // Anota o resultado numa transação curta; se até isso falhar, só registra no log.
    try {
      await transaction(async (db) => {
        const current = await lockRequest(db, id);
        const note = email.enviado ? `E-mail ${label} enviado ao adotante.` : `E-mail ${label} não enviado. ${email.motivo}`;
        await repository.update(db, id, { observacoes: appendNote(current.observacoes, 'Sistema', note, now()) });
      });
    } catch (error) {
      log.error('historico_email_falhou', { module: 'adoptions', entityId: id, code: error.code });
    }
    return email;
  }

  /*
   * assertFuture: a data/hora precisa ser no futuro (senão, 422).
   */
  function assertFuture(dataHora) {
    if (parseBrasiliaDateTime(dataHora) <= now()) {
      throw new AppError(422, 'DATA_NO_PASSADO', 'Escolha uma data e um horário futuros.', [
        { field: 'data_hora', message: 'Escolha uma data e um horário futuros.' },
      ]);
    }
  }

  /*
   * resolveResponsible: decide quem é o responsável pelo compromisso.
   * Retorno: id do responsável (ou null).
   */
  // Responsável pelo compromisso: o informado (precisa ser da equipe de adoções), senão o responsável
  // pelo pedido, senão quem está agendando.
  async function resolveResponsible(db, payload, current, actor) {
    if (!payload.responsavel_id) return current.responsavel_id || actor.userId || null;
    const responsible = await repository.findActiveUser(db, payload.responsavel_id);
    if (!responsible || !hasPermission(responsible.cargo, 'adoptions:update')) {
      throw new AppError(422, 'RESPONSAVEL_INVALIDO', 'Escolha um usuário ativo da equipe de adoções.', [
        { field: 'responsavel_id', message: 'Usuário inexistente, inativo ou sem acesso às adoções.' },
      ]);
    }
    return responsible.id;
  }

  /*
   * assertNoConflict: trava a agenda e lança 409 se o responsável já tiver compromisso no horário.
   * Sem responsável, não há o que conferir.
   */
  // Conflito: o mesmo responsável já tem compromisso ativo que se sobrepõe ao novo horário.
  async function assertNoConflict(db, { responsavelId, inicio, duracaoMinutos, excludeId }) {
    if (!responsavelId) return;
    await appointments.lockSchedule(db);
    const [conflict] = await appointments.findConflicts(db, { responsavelId, inicio, duracaoMinutos, excludeId });
    if (!conflict) return;
    // Mensagem explicando com quem e quando é o conflito.
    const { data, hora } = describeDate(conflict.previsto_em);
    const message = `${conflict.responsavel_nome || 'O responsável'} já tem ${APPOINTMENT_LABELS[conflict.tipo].toLowerCase()} `
      + `com ${conflict.adotante_nome} em ${data} às ${hora}. Escolha outro horário ou outro responsável.`;
    throw new AppError(409, 'HORARIO_INDISPONIVEL', message, [{ field: 'data_hora', message }]);
  }

  /*
   * appointmentFields: monta local, mensagem e duração.
   * Campo enviado no corpo → usa o enviado (texto limpo); não enviado → usa o valor atual (fallback)
   * ou o padrão. "?." e "??" tratam valores ausentes/null.
   */
  function appointmentFields(payload, fallback = {}) {
    return {
      local: payload.local !== undefined ? payload.local?.trim() || '' : fallback.local || '',
      mensagem: payload.mensagem !== undefined ? payload.mensagem?.trim() || '' : fallback.mensagem || '',
      duracaoMinutos: payload.duracao_minutos ?? fallback.duracao_minutos ?? DEFAULT_APPOINTMENT_MINUTES,
    };
  }

  /*
   * schedule: AGENDA uma visita ou entrevista.
   * Retorno: { pedido (detalhe), agendamento, email (resultado ou null) }.
   */
  // Agenda visita ou entrevista: grava o compromisso (com verificação de conflito), anota no histórico
  // e, se pedido, avisa o adotante por e-mail depois de gravar.
  async function schedule(id, payload, actor = {}) {
    // Validações que não precisam do banco.
    assertFuture(payload.data_hora);
    const fields = appointmentFields(payload);
    const sendEmail = payload.enviar_email === true;
    const { diaSemana, data, hora } = describeBrasiliaDateTime(payload.data_hora);

    const agendamento = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);
      const responsavelId = await resolveResponsible(db, payload, current, actor);
      const inicio = parseBrasiliaDateTime(payload.data_hora);
      await assertNoConflict(db, { responsavelId, inicio, duracaoMinutos: fields.duracaoMinutos });

      // Grava o compromisso.
      const created = await appointments.create(db, {
        pedidoId: id,
        tipo: payload.tipo,
        previstoEm: inicio,
        duracaoMinutos: fields.duracaoMinutos,
        local: fields.local,
        mensagem: fields.mensagem,
        responsavelId,
      });

      // Visita move o pedido para "visita agendada"; entrevista só tira o pedido de "novo".
      // (Ternário encadeado: visita ? 'visita_agendada' : (novo ? 'em_analise' : status atual).)
      const nextStatus = payload.tipo === 'visita'
        ? 'visita_agendada'
        : current.status === 'novo' ? 'em_analise' : current.status;
      // Anotação: frases opcionais vazias são removidas antes de juntar.
      const note = [
        `${APPOINTMENT_LABELS[payload.tipo]} agendada para ${diaSemana}, ${data} às ${hora}.`,
        fields.local ? `Local: ${fields.local}.` : '',
        fields.mensagem ? `Mensagem ao adotante: ${fields.mensagem}` : '',
      ].filter(Boolean).join(' ');

      const changes = { observacoes: appendNote(current.observacoes, actor.name || 'Equipe', note, now()) };
      if (nextStatus !== current.status) changes.status = nextStatus;
      await repository.update(db, id, changes);

      // Adotante acompanha a etapa "visita agendada".
      if (changes.status === 'visita_agendada' && current.adotante_status !== 'adotante') {
        await repository.setAdopterStatus(db, current.adotante_id, 'visita_agendada');
      }

      await audit.record({
        actor,
        action: 'agendar',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        before: { status: current.status },
        after: { status: nextStatus, agendamento_id: created.id, tipo: payload.tipo, data_hora: payload.data_hora, enviar_email: sendEmail },
      }, db);

      return created;
    });

    // E-mail (opcional) depois de gravar.
    const email = sendEmail
      ? await notifyAdopter(id, (request) => buildAppointmentEmail({
        tipo: payload.tipo,
        dataHora: payload.data_hora,
        local: fields.local,
        mensagem: fields.mensagem,
        adotanteNome: request.adotante_nome,
        animalNome: request.animal_nome,
      }), 'com o agendamento')
      : null;

    return { pedido: await loadDetail(undefined, id), agendamento: toAppointment(agendamento), email };
  }

  /*
   * lockActiveAppointment: trava o compromisso; ele precisa ser deste pedido (404) e estar "agendado" (409).
   */
  async function lockActiveAppointment(db, id, appointmentId) {
    const appointment = await appointments.findById(db, appointmentId, { forUpdate: true });
    if (!appointment || appointment.pedido_id !== id) {
      throw new AppError(404, 'AGENDAMENTO_NAO_ENCONTRADO', 'Agendamento não encontrado neste pedido.');
    }
    if (appointment.status !== 'agendado') {
      throw new AppError(409, 'AGENDAMENTO_ENCERRADO', 'Este agendamento já foi realizado ou cancelado.');
    }
    return appointment;
  }

  /*
   * reschedule: REMARCA um compromisso (nova data; local/mensagem/duração opcionais).
   * Retorno: { pedido, agendamento, email }.
   */
  async function reschedule(id, appointmentId, payload, actor = {}) {
    assertFuture(payload.data_hora);
    const sendEmail = payload.enviar_email === true;

    // A transação devolve o compromisso antes e depois (desestruturados em before/after).
    const { before, after } = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);
      const appointment = await lockActiveAppointment(db, id, appointmentId);
      const fields = appointmentFields(payload, appointment);
      const inicio = parseBrasiliaDateTime(payload.data_hora);
      // Confere conflito ignorando o próprio compromisso (excludeId).
      await assertNoConflict(db, {
        responsavelId: appointment.responsavel_id,
        inicio,
        duracaoMinutos: fields.duracaoMinutos,
        excludeId: appointment.id,
      });

      const updated = await appointments.update(db, appointment.id, {
        previsto_em: inicio,
        duracao_minutos: fields.duracaoMinutos,
        local: fields.local || null,
        mensagem: fields.mensagem || null,
      });

      // Anotação "remarcada de X para Y".
      const old = describeDate(appointment.previsto_em);
      const next = describeBrasiliaDateTime(payload.data_hora);
      const note = `${APPOINTMENT_LABELS[appointment.tipo]} remarcada de ${old.data} às ${old.hora} para ${next.diaSemana}, ${next.data} às ${next.hora}.`;
      await repository.update(db, id, { observacoes: appendNote(current.observacoes, actor.name || 'Equipe', note, now()) });
      await audit.record({
        actor,
        action: 'remarcar_agendamento',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        before: { agendamento_id: appointment.id, previsto_em: appointment.previsto_em },
        after: { agendamento_id: appointment.id, data_hora: payload.data_hora, enviar_email: sendEmail },
      }, db);
      return { before: appointment, after: updated };
    });

    const email = sendEmail
      ? await notifyAdopter(id, (request) => buildAppointmentRescheduledEmail({
        tipo: before.tipo,
        dataHora: payload.data_hora,
        local: after.local,
        mensagem: after.mensagem,
        adotanteNome: request.adotante_nome,
        animalNome: request.animal_nome,
      }), 'com a remarcação')
      : null;

    return { pedido: await loadDetail(undefined, id), agendamento: toAppointment(after), email };
  }

  /*
   * cancelAppointment: CANCELA um compromisso (motivo opcional).
   * Funciona também em pedido já decidido (usa lockRequest, não lockOpenRequest).
   */
  // Cancelar a única visita ativa devolve o pedido (e o adotante) para "em análise".
  async function cancelAppointment(id, appointmentId, payload = {}, actor = {}) {
    const sendEmail = payload.enviar_email === true;
    const motivo = payload.motivo?.trim() || '';

    const cancelled = await transaction(async (db) => {
      const current = await lockRequest(db, id);
      const appointment = await lockActiveAppointment(db, id, appointmentId);
      const updated = await appointments.update(db, appointment.id, { status: 'cancelado' });

      const { data, hora } = describeDate(appointment.previsto_em);
      const changes = {
        observacoes: appendNote(
          current.observacoes,
          actor.name || 'Equipe',
          `${APPOINTMENT_LABELS[appointment.tipo]} de ${data} às ${hora} cancelada.${motivo ? ` Motivo: ${motivo}` : ''}`,
          now()
        ),
      };
      // Volta para "em_analise" só se: era visita, o pedido estava em "visita_agendada" e não sobrou outra visita.
      const reopens = appointment.tipo === 'visita' && current.status === 'visita_agendada'
        && (await appointments.countActiveVisits(db, id)) === 0;
      if (reopens) changes.status = 'em_analise';
      await repository.update(db, id, changes);
      if (reopens && current.adotante_status === 'visita_agendada') {
        await repository.setAdopterStatus(db, current.adotante_id, 'em_analise');
      }

      await audit.record({
        actor,
        action: 'cancelar_agendamento',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        before: { agendamento_id: appointment.id, status: 'agendado', pedido_status: current.status },
        after: { agendamento_id: appointment.id, status: 'cancelado', pedido_status: changes.status || current.status, motivo },
      }, db);
      return updated;
    });

    const email = sendEmail
      ? await notifyAdopter(id, (request) => buildAppointmentCancelledEmail({
        tipo: cancelled.tipo,
        dataHora: toBrasiliaDateTime(cancelled.previsto_em),
        motivo,
        adotanteNome: request.adotante_nome,
        animalNome: request.animal_nome,
      }), 'com o cancelamento')
      : null;

    return { pedido: await loadDetail(undefined, id), agendamento: toAppointment(cancelled), email };
  }

  /*
   * completeAppointment: marca o compromisso como REALIZADO e anota no histórico.
   */
  async function completeAppointment(id, appointmentId, actor = {}) {
    return transaction(async (db) => {
      const current = await lockRequest(db, id);
      const appointment = await lockActiveAppointment(db, id, appointmentId);
      await appointments.update(db, appointment.id, { status: 'realizado' });
      const { data, hora } = describeDate(appointment.previsto_em);
      await repository.update(db, id, {
        observacoes: appendNote(current.observacoes, actor.name || 'Equipe', `${APPOINTMENT_LABELS[appointment.tipo]} de ${data} às ${hora} realizada.`, now()),
      });
      await audit.record({
        actor,
        action: 'concluir_agendamento',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        after: { agendamento_id: appointment.id, status: 'realizado' },
      }, db);
      return { pedido: await loadDetail(db, id) };
    });
  }

  /*
   * markTermSigned: registra a assinatura do Termo de Adoção (só em pedido aprovado e uma vez só).
   */
  async function markTermSigned(id, actor = {}) {
    return transaction(async (db) => {
      const current = await lockRequest(db, id);
      if (current.status !== 'aprovado') {
        throw new AppError(409, 'PEDIDO_NAO_APROVADO', 'O termo só pode ser marcado como assinado em pedidos aprovados.');
      }
      if (current.termo_assinado) {
        throw new AppError(409, 'TERMO_JA_ASSINADO', 'O termo deste pedido já está marcado como assinado.');
      }

      const signedAt = now();
      await repository.update(db, id, { termo_assinado: true, termo_assinado_em: signedAt });
      await audit.record({
        actor,
        action: 'marcar_termo_assinado',
        module: 'adoptions',
        entity: 'pedido_adocao',
        entityId: id,
        before: { termo_assinado: false },
        after: { termo_assinado: true, termo_assinado_em: signedAt.toISOString() },
      }, db);

      return loadDetail(db, id);
    });
  }

  // Operações públicas do service.
  return {
    list,
    board,
    getById,
    reveal,
    update,
    approve,
    reject,
    schedule,
    reschedule,
    cancelAppointment,
    completeAppointment,
    markTermSigned,
  };
}

// Exporta uma instância pronta e a fábrica (para os testes).
module.exports = { ...createAdoptionTriageService(), createAdoptionTriageService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. Leitura: list/board/getById devolvem dados mascarados; reveal mostra tudo e audita.
 *   2. Edição: update trava o pedido, aplica só o que mudou, mantém o status do
 *      adotante coerente, anota no histórico e audita.
 *   3. Decisão: approve/reject travam pedido e animal e atualizam, numa única
 *      transação, pedido, animal, adotante, outros pedidos e agenda.
 *   4. Agenda: schedule/reschedule conferem data futura e conflitos (com trava de
 *      agenda); cancel/complete encerram compromissos e ajustam a etapa.
 *   5. E-mails: sempre depois da transação (notifyAdopter); o resultado é anotado
 *      no histórico e devolvido ao painel. Falha de e-mail não desfaz a ação.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Transações e travas (FOR UPDATE, advisory lock) contra condições de corrida.
 *   - Consistência entre entidades relacionadas (pedido, animal, adotante, agenda).
 *   - Máquina de estados do pedido (novo → em_analise → visita_agendada → aprovado/reprovado).
 *   - Efeitos colaterais (e-mail) fora da transação.
 *   - Histórico de anotações e auditoria.
 *   - Funções como parâmetro (buildMessage), ternários encadeados, ?. e ??.
 * ============================================================================
 */
