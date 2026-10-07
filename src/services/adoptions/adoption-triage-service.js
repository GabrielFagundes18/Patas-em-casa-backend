const AppError = require('../../utils/app-error');
const { adoptionRequest } = require('../../config/domain-values');
const { hasPermission } = require('../../config/permissions');
const { describeBrasiliaDateTime, parseBrasiliaDateTime, toBrasiliaDateTime } = require('../../utils/brasilia-time');
const logger = require('../../utils/logger');
const { maskContactsInText, maskEmail, maskPhone } = require('../../utils/masking');
const { parsePagination } = require('../../utils/pagination');
const withTransaction = require('../../db/transaction');
const triageRepository = require('../../repositories/adoptions/adoption-triage-repository');
const appointmentRepository = require('../../repositories/adoptions/appointment-repository');
const auditService = require('../audit/audit-service');
const defaultMailer = require('../../integrations/email/mailer');
const {
  buildAppointmentCancelledEmail,
  buildAppointmentEmail,
  buildAppointmentRescheduledEmail,
  buildDecisionEmail,
} = require('../../integrations/email/adoption-emails');

const OPEN_STATUSES = adoptionRequest.openStatus;
const APPOINTMENT_LABELS = { visita: 'Visita', entrevista: 'Entrevista' };
const DEFAULT_APPOINTMENT_MINUTES = 60;
const BOARD_COLUMN_LIMIT = 50;
const noteDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function notFound() {
  return new AppError(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido de adoção não encontrado.');
}

function alreadyDecided() {
  return new AppError(409, 'PEDIDO_ENCERRADO', 'Este pedido já foi decidido; só é possível adicionar anotações.');
}

// Anotações ficam no histórico do pedido com data, hora e autor.
function appendNote(existing, author, text, date) {
  const entry = `[${noteDateFormatter.format(date)} — ${author}] ${text.trim()}`;
  return existing ? `${existing}\n\n${entry}` : entry;
}

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
    responsavel: row.responsavel_id ? { id: row.responsavel_id, nome: row.responsavel_nome } : null,
  };
}

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

function toDetail(row, agendamentos = []) {
  return {
    ...toSummary(row),
    observacoes: maskContactsInText(row.observacoes),
    visita_preferida_em: row.visita_preferida_em ? toBrasiliaDateTime(row.visita_preferida_em) : null,
    agendamentos: agendamentos.map(toAppointment),
  };
}

function describeDate(date) {
  return describeBrasiliaDateTime(toBrasiliaDateTime(date));
}

function createAdoptionTriageService(repository = triageRepository, {
  audit = auditService,
  transaction = withTransaction,
  now = () => new Date(),
  mailer = defaultMailer,
  log = logger,
  appointments = appointmentRepository,
} = {}) {
  async function loadDetail(db, id) {
    const row = await repository.findById(db, id);
    return toDetail(row, await appointments.listForRequest(db, id));
  }

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

  async function lockOpenRequest(db, id) {
    const request = await lockRequest(db, id);
    if (!OPEN_STATUSES.includes(request.status)) throw alreadyDecided();
    return request;
  }

  // Sem outros pedidos abertos, o candidato deixa de estar "em análise".
  async function releaseAdopter(db, request) {
    if (!['em_analise', 'visita_agendada'].includes(request.adotante_status)) return;
    const openRequests = await repository.countOpenRequestsForAdopter(db, request.adotante_id, request.id);
    if (openRequests === 0) await repository.setAdopterStatus(db, request.adotante_id, 'inativo');
  }

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

  async function board({ incluirReprovados = false } = {}) {
    const statuses = incluirReprovados
      ? adoptionRequest.status
      : adoptionRequest.status.filter((status) => status !== 'reprovado');
    const columns = [];

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

  async function getById(id) {
    await findRequest(id);
    return loadDetail(undefined, id);
  }

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

  async function update(id, payload, actor = {}) {
    return transaction(async (db) => {
      const current = await lockRequest(db, id);

      const changesTriage = ['status', 'prioridade', 'responsavel_id'].some((field) => Object.hasOwn(payload, field));
      if (!OPEN_STATUSES.includes(current.status) && changesTriage) throw alreadyDecided();

      const changes = {};
      if (payload.status !== undefined && payload.status !== current.status) changes.status = payload.status;
      if (payload.prioridade !== undefined && payload.prioridade !== current.prioridade) changes.prioridade = payload.prioridade;

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

      if (payload.nota) {
        changes.observacoes = appendNote(current.observacoes, actor.name || 'Equipe', payload.nota, now());
      }

      await repository.update(db, id, changes);

      if (changes.status === 'visita_agendada' && current.adotante_status !== 'adotante') {
        await repository.setAdopterStatus(db, current.adotante_id, 'visita_agendada');
      } else if (changes.status && current.status === 'visita_agendada' && current.adotante_status === 'visita_agendada') {
        await repository.setAdopterStatus(db, current.adotante_id, 'em_analise');
      }

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

  async function approve(id, payload, actor = {}) {
    const { justificativa } = payload;
    const detail = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);

      const animal = await repository.lockAnimal(db, current.animal_id);
      if (animal.status === 'adotado') {
        throw new AppError(409, 'ANIMAL_JA_ADOTADO', 'Este animal já foi adotado em outro pedido.');
      }
      if (animal.status === 'inativo') {
        throw new AppError(409, 'ANIMAL_INATIVO', 'Este animal está inativo; reative-o antes de aprovar a adoção.');
      }

      const date = now();
      await repository.update(db, id, {
        status: 'aprovado',
        observacoes: appendNote(current.observacoes, actor.name || 'Equipe', `Aprovado. Justificativa: ${justificativa}`, date),
      });
      await repository.setAnimalStatus(db, animal.id, 'adotado');
      await repository.setAdopterStatus(db, current.adotante_id, 'adotante');

      const otherRequests = await repository.lockOpenRequestsForAnimal(db, animal.id, id);
      for (const other of otherRequests) {
        await repository.update(db, other.id, {
          status: 'reprovado',
          observacoes: appendNote(other.observacoes, 'Sistema', 'Reprovado automaticamente: o animal foi adotado em outro pedido.', date),
        });
        await appointments.cancelActiveForRequest(db, other.id);
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

    return notifyDecision(id, detail, payload, true);
  }

  // A justificativa é interna; o adotante só recebe a mensagem escrita para ele (mensagem_adotante).
  async function notifyDecision(id, detail, payload, aprovado) {
    if (payload.notificar_adotante !== true) return { ...detail, email: null };
    const email = await notifyAdopter(
      id,
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

  async function reject(id, payload, actor = {}) {
    const { justificativa } = payload;
    const detail = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);

      const animal = await repository.lockAnimal(db, current.animal_id);
      const cancelled = await appointments.cancelActiveForRequest(db, id);
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

    return notifyDecision(id, detail, payload, false);
  }

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
        email = { enviado: true, para: maskEmail(request.adotante_email) };
      } catch (error) {
        log.error('email_adotante_falhou', { module: 'adoptions', entityId: id, code: error.code });
        email = { enviado: false, motivo: 'O servidor de e-mail recusou ou não respondeu ao envio.' };
      }
    }

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

  function assertFuture(dataHora) {
    if (parseBrasiliaDateTime(dataHora) <= now()) {
      throw new AppError(422, 'DATA_NO_PASSADO', 'Escolha uma data e um horário futuros.', [
        { field: 'data_hora', message: 'Escolha uma data e um horário futuros.' },
      ]);
    }
  }

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

  // Conflito: o mesmo responsável já tem compromisso ativo que se sobrepõe ao novo horário.
  async function assertNoConflict(db, { responsavelId, inicio, duracaoMinutos, excludeId }) {
    if (!responsavelId) return;
    await appointments.lockSchedule(db);
    const [conflict] = await appointments.findConflicts(db, { responsavelId, inicio, duracaoMinutos, excludeId });
    if (!conflict) return;
    const { data, hora } = describeDate(conflict.previsto_em);
    const message = `${conflict.responsavel_nome || 'O responsável'} já tem ${APPOINTMENT_LABELS[conflict.tipo].toLowerCase()} `
      + `com ${conflict.adotante_nome} em ${data} às ${hora}. Escolha outro horário ou outro responsável.`;
    throw new AppError(409, 'HORARIO_INDISPONIVEL', message, [{ field: 'data_hora', message }]);
  }

  function appointmentFields(payload, fallback = {}) {
    return {
      local: payload.local !== undefined ? payload.local?.trim() || '' : fallback.local || '',
      mensagem: payload.mensagem !== undefined ? payload.mensagem?.trim() || '' : fallback.mensagem || '',
      duracaoMinutos: payload.duracao_minutos ?? fallback.duracao_minutos ?? DEFAULT_APPOINTMENT_MINUTES,
    };
  }

  // Agenda visita ou entrevista: grava o compromisso (com verificação de conflito), anota no histórico
  // e, se pedido, avisa o adotante por e-mail depois de gravar.
  async function schedule(id, payload, actor = {}) {
    assertFuture(payload.data_hora);
    const fields = appointmentFields(payload);
    const sendEmail = payload.enviar_email === true;
    const { diaSemana, data, hora } = describeBrasiliaDateTime(payload.data_hora);

    const agendamento = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);
      const responsavelId = await resolveResponsible(db, payload, current, actor);
      const inicio = parseBrasiliaDateTime(payload.data_hora);
      await assertNoConflict(db, { responsavelId, inicio, duracaoMinutos: fields.duracaoMinutos });

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
      const nextStatus = payload.tipo === 'visita'
        ? 'visita_agendada'
        : current.status === 'novo' ? 'em_analise' : current.status;
      const note = [
        `${APPOINTMENT_LABELS[payload.tipo]} agendada para ${diaSemana}, ${data} às ${hora}.`,
        fields.local ? `Local: ${fields.local}.` : '',
        fields.mensagem ? `Mensagem ao adotante: ${fields.mensagem}` : '',
      ].filter(Boolean).join(' ');

      const changes = { observacoes: appendNote(current.observacoes, actor.name || 'Equipe', note, now()) };
      if (nextStatus !== current.status) changes.status = nextStatus;
      await repository.update(db, id, changes);

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

  async function reschedule(id, appointmentId, payload, actor = {}) {
    assertFuture(payload.data_hora);
    const sendEmail = payload.enviar_email === true;

    const { before, after } = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);
      const appointment = await lockActiveAppointment(db, id, appointmentId);
      const fields = appointmentFields(payload, appointment);
      const inicio = parseBrasiliaDateTime(payload.data_hora);
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

module.exports = { ...createAdoptionTriageService(), createAdoptionTriageService };
