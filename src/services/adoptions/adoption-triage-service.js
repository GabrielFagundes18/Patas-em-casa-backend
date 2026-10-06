const AppError = require('../../utils/app-error');
const { adoptionRequest } = require('../../config/domain-values');
const { hasPermission } = require('../../config/permissions');
const { describeBrasiliaDateTime, parseBrasiliaDateTime } = require('../../utils/brasilia-time');
const logger = require('../../utils/logger');
const { maskContactsInText, maskEmail, maskPhone } = require('../../utils/masking');
const { parsePagination } = require('../../utils/pagination');
const withTransaction = require('../../db/transaction');
const triageRepository = require('../../repositories/adoptions/adoption-triage-repository');
const auditService = require('../audit/audit-service');
const defaultMailer = require('../email/mailer');
const { buildAppointmentEmail } = require('../email/adoption-emails');

const OPEN_STATUSES = adoptionRequest.openStatus;
const APPOINTMENT_LABELS = { visita: 'Visita', entrevista: 'Entrevista' };
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

function toDetail(row) {
  return { ...toSummary(row), observacoes: maskContactsInText(row.observacoes) };
}

function createAdoptionTriageService(repository = triageRepository, {
  audit = auditService,
  transaction = withTransaction,
  now = () => new Date(),
  mailer = defaultMailer,
  log = logger,
} = {}) {
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
    const request = await findRequest(id);
    return toDetail(request);
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

      return toDetail(await repository.findById(db, id));
    });
  }

  async function approve(id, { justificativa }, actor = {}) {
    return transaction(async (db) => {
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

      return toDetail(await repository.findById(db, id));
    });
  }

  async function reject(id, { justificativa }, actor = {}) {
    return transaction(async (db) => {
      const current = await lockOpenRequest(db, id);

      const animal = await repository.lockAnimal(db, current.animal_id);
      await repository.update(db, id, {
        status: 'reprovado',
        observacoes: appendNote(current.observacoes, actor.name || 'Equipe', `Reprovado. Justificativa: ${justificativa}`, now()),
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

      return toDetail(await repository.findById(db, id));
    });
  }

  async function sendAppointmentEmail(request, appointment) {
    if (!mailer.isConfigured()) {
      return { enviado: false, motivo: 'O envio de e-mails não está configurado no servidor (SMTP).' };
    }

    try {
      await mailer.send({
        to: request.adotante_email,
        ...buildAppointmentEmail({ ...appointment, adotanteNome: request.adotante_nome, animalNome: request.animal_nome }),
      });
      return { enviado: true, para: maskEmail(request.adotante_email) };
    } catch (error) {
      log.error('email_agendamento_falhou', { module: 'adoptions', entityId: request.id, code: error.code });
      return { enviado: false, motivo: 'O servidor de e-mail recusou ou não respondeu ao envio.' };
    }
  }

  // Agenda visita ou entrevista. Enquanto a agenda da migração 004 não existe, o compromisso fica no
  // histórico do pedido. O e-mail sai só depois de gravar; se falhar, o agendamento continua valendo.
  async function schedule(id, payload, actor = {}) {
    if (parseBrasiliaDateTime(payload.data_hora) <= now()) {
      throw new AppError(422, 'DATA_NO_PASSADO', 'Escolha uma data e um horário futuros.', [
        { field: 'data_hora', message: 'Escolha uma data e um horário futuros.' },
      ]);
    }

    const appointment = {
      tipo: payload.tipo,
      dataHora: payload.data_hora,
      local: payload.local?.trim() || '',
      mensagem: payload.mensagem?.trim() || '',
    };
    const sendEmail = payload.enviar_email === true;
    const { diaSemana, data, hora } = describeBrasiliaDateTime(appointment.dataHora);

    const scheduled = await transaction(async (db) => {
      const current = await lockOpenRequest(db, id);

      // Visita move o pedido para "visita agendada"; entrevista só tira o pedido de "novo".
      const nextStatus = appointment.tipo === 'visita'
        ? 'visita_agendada'
        : current.status === 'novo' ? 'em_analise' : current.status;
      const note = [
        `${APPOINTMENT_LABELS[appointment.tipo]} agendada para ${diaSemana}, ${data} às ${hora}.`,
        appointment.local ? `Local: ${appointment.local}.` : '',
        appointment.mensagem ? `Mensagem ao adotante: ${appointment.mensagem}` : '',
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
        after: { status: nextStatus, tipo: appointment.tipo, data_hora: appointment.dataHora, enviar_email: sendEmail },
      }, db);

      return repository.findById(db, id);
    });

    if (!sendEmail) return { pedido: toDetail(scheduled), email: null };

    const email = await sendAppointmentEmail(scheduled, appointment);

    // O resultado do envio também vai para o histórico, para a equipe saber se o adotante foi avisado.
    try {
      const updated = await transaction(async (db) => {
        const current = await lockRequest(db, id);
        const note = email.enviado
          ? 'E-mail com o agendamento enviado ao adotante.'
          : `E-mail com o agendamento não enviado. ${email.motivo}`;
        await repository.update(db, id, { observacoes: appendNote(current.observacoes, 'Sistema', note, now()) });
        return repository.findById(db, id);
      });
      return { pedido: toDetail(updated), email };
    } catch (error) {
      log.error('historico_email_falhou', { module: 'adoptions', entityId: id, code: error.code });
      return { pedido: toDetail(scheduled), email };
    }
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

      return toDetail(await repository.findById(db, id));
    });
  }

  return { list, board, getById, reveal, update, approve, reject, schedule, markTermSigned };
}

module.exports = { ...createAdoptionTriageService(), createAdoptionTriageService };
