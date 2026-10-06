const assert = require('node:assert/strict');
const test = require('node:test');
const { createAdoptionTriageService } = require('../src/services/adoptions/adoption-triage-service');

const OPEN = ['novo', 'em_analise', 'visita_agendada'];
const actor = { userId: '11111111-1111-4111-8111-111111111111', role: 'gestor_animais', name: 'Carla' };

// Banco em memória com dois candidatos para o mesmo animal.
function setup({ animalStatus = 'em_processo', mailer = { isConfigured: () => false, send: async () => {} } } = {}) {
  const animals = new Map([['animal-1', { id: 'animal-1', nome: 'Nino', especie: 'cachorro', status: animalStatus, foto_url: null }]]);
  const adopters = new Map([
    ['adotante-1', { id: 'adotante-1', nome: 'Ana', email: 'ana@example.org', telefone: '(11) 98888-7777', cidade: 'Campinas', estado: 'SP', status: 'em_analise' }],
    ['adotante-2', { id: 'adotante-2', nome: 'Bia', email: 'bia@example.org', telefone: null, cidade: 'Santos', estado: 'SP', status: 'em_analise' }],
  ]);
  const requests = new Map([
    ['pedido-1', { id: 'pedido-1', animal_id: 'animal-1', adotante_id: 'adotante-1', status: 'em_analise', prioridade: 'medio', observacoes: 'Telefone informado: (11) 98888-7777', responsavel_id: null, termo_assinado: false, termo_assinado_em: null }],
    ['pedido-2', { id: 'pedido-2', animal_id: 'animal-1', adotante_id: 'adotante-2', status: 'novo', prioridade: 'alto', observacoes: null, responsavel_id: null, termo_assinado: false, termo_assinado_em: null }],
  ]);
  const users = new Map([
    ['22222222-2222-4222-8222-222222222222', { id: '22222222-2222-4222-8222-222222222222', nome: 'Gestor', cargo: 'gestor_animais' }],
    ['44444444-4444-4444-8444-444444444444', { id: '44444444-4444-4444-8444-444444444444', nome: 'Voluntário', cargo: 'voluntariado' }],
  ]);

  const toRow = (request) => {
    const animal = animals.get(request.animal_id);
    const adopter = adopters.get(request.adotante_id);
    return {
      ...request,
      data_pedido: '2026-10-01T12:00:00.000Z',
      atualizado_em: '2026-10-02T12:00:00.000Z',
      animal_nome: animal.nome,
      animal_especie: animal.especie,
      animal_status: animal.status,
      animal_foto_url: animal.foto_url,
      adotante_nome: adopter.nome,
      adotante_email: adopter.email,
      adotante_telefone: adopter.telefone,
      adotante_cidade: adopter.cidade,
      adotante_estado: adopter.estado,
      adotante_status: adopter.status,
      responsavel_nome: users.get(request.responsavel_id)?.nome ?? null,
    };
  };

  const repository = {
    findById: async (db, id) => (requests.has(id) ? toRow(requests.get(id)) : null),
    update: async (db, id, changes) => Object.assign(requests.get(id), changes),
    lockAnimal: async (db, id) => ({ ...animals.get(id) }),
    setAnimalStatus: async (db, id, status) => { animals.get(id).status = status; },
    setAdopterStatus: async (db, id, status) => { adopters.get(id).status = status; },
    lockOpenRequestsForAnimal: async (db, animalId, excludeId) => [...requests.values()]
      .filter((request) => request.animal_id === animalId && request.id !== excludeId && OPEN.includes(request.status))
      .map((request) => ({ ...request })),
    countOpenRequestsForAdopter: async (db, adopterId, excludeId) => [...requests.values()]
      .filter((request) => request.adotante_id === adopterId && request.id !== excludeId && OPEN.includes(request.status)).length,
    findActiveUser: async (db, id) => users.get(id) || null,
  };

  const audits = [];
  const service = createAdoptionTriageService(repository, {
    audit: { record: async (event) => audits.push(event) },
    transaction: (work) => work('tx'),
    now: () => new Date('2026-10-04T15:00:00.000Z'),
    mailer,
    log: { error: () => {} },
  });

  return { service, animals, adopters, requests, audits };
}

test('approving a request adopts the animal and auto-rejects the other open requests', async () => {
  const { service, animals, adopters, requests, audits } = setup();

  const result = await service.approve('pedido-1', { justificativa: 'Família preparada e visita aprovada.' }, actor);

  assert.equal(result.status, 'aprovado');
  assert.equal(animals.get('animal-1').status, 'adotado');
  assert.equal(adopters.get('adotante-1').status, 'adotante');
  assert.equal(requests.get('pedido-2').status, 'reprovado');
  assert.match(requests.get('pedido-2').observacoes, /Reprovado automaticamente/);
  assert.equal(adopters.get('adotante-2').status, 'inativo');
  assert.match(requests.get('pedido-1').observacoes, /Carla\] Aprovado\. Justificativa: Família preparada/);
  assert.deepEqual(audits.map((event) => event.action).sort(), ['aprovar', 'reprovar_automaticamente']);
  assert.doesNotMatch(result.observacoes, /98888-7777/);
  assert.equal(result.adotante.email, 'an***@example.org');
});

test('approval is refused when the animal was already adopted', async () => {
  const { service } = setup({ animalStatus: 'adotado' });
  await assert.rejects(service.approve('pedido-1', { justificativa: 'Justificativa suficiente.' }, actor), { status: 409, code: 'ANIMAL_JA_ADOTADO' });
});

test('rejecting the last open request releases the animal', async () => {
  const { service, animals } = setup();

  await service.reject('pedido-2', { justificativa: 'Não possui espaço adequado.' }, actor);
  assert.equal(animals.get('animal-1').status, 'em_processo');

  await service.reject('pedido-1', { justificativa: 'Desistiu da adoção por telefone.' }, actor);
  assert.equal(animals.get('animal-1').status, 'disponivel');
});

test('decided requests accept only notes, and moving to a visit updates the adopter', async () => {
  const { service, adopters, requests } = setup();

  await service.update('pedido-1', { status: 'visita_agendada' }, actor);
  assert.equal(adopters.get('adotante-1').status, 'visita_agendada');

  await service.approve('pedido-1', { justificativa: 'Visita realizada com sucesso.' }, actor);
  await assert.rejects(service.update('pedido-1', { prioridade: 'alto' }, actor), { status: 409, code: 'PEDIDO_ENCERRADO' });

  await service.update('pedido-1', { nota: 'Retorno pós-adoção: tudo bem.' }, actor);
  assert.match(requests.get('pedido-1').observacoes, /Retorno pós-adoção: tudo bem\./);
});

test('only active team members with adoption access can be responsible', async () => {
  const { service, requests } = setup();

  await assert.rejects(
    service.update('pedido-1', { responsavel_id: '44444444-4444-4444-8444-444444444444' }, actor),
    { status: 422, code: 'RESPONSAVEL_INVALIDO' }
  );

  const result = await service.update('pedido-1', { responsavel_id: '22222222-2222-4222-8222-222222222222' }, actor);
  assert.equal(result.responsavel.nome, 'Gestor');
  assert.equal(requests.get('pedido-1').responsavel_id, '22222222-2222-4222-8222-222222222222');
});

test('the adoption term can be signed only once and only after approval', async () => {
  const { service, requests } = setup();

  await assert.rejects(service.markTermSigned('pedido-1', actor), { status: 409, code: 'PEDIDO_NAO_APROVADO' });
  await service.approve('pedido-1', { justificativa: 'Família preparada e visita aprovada.' }, actor);

  const signed = await service.markTermSigned('pedido-1', actor);
  assert.equal(signed.termo_assinado, true);
  assert.ok(requests.get('pedido-1').termo_assinado_em instanceof Date);
  await assert.rejects(service.markTermSigned('pedido-1', actor), { status: 409, code: 'TERMO_JA_ASSINADO' });
});

test('scheduling a visit moves the request, records it in the history and emails the adopter', async () => {
  const sent = [];
  const mailer = { isConfigured: () => true, send: async (message) => sent.push(message) };
  const { service, requests, adopters, audits } = setup({ mailer });

  const result = await service.schedule('pedido-2', {
    tipo: 'visita',
    data_hora: '2026-10-10T14:00',
    local: 'Rua das Flores, 10 <b>',
    mensagem: 'Leve um documento com foto.',
    enviar_email: true,
  }, actor);

  assert.equal(result.pedido.status, 'visita_agendada');
  assert.equal(adopters.get('adotante-2').status, 'visita_agendada');
  assert.deepEqual(result.email, { enviado: true, para: 'bi***@example.org' });
  assert.match(requests.get('pedido-2').observacoes, /Carla\] Visita agendada para sábado, 10\/10\/2026 às 14:00\. Local: Rua das Flores/);
  assert.match(requests.get('pedido-2').observacoes, /Sistema\] E-mail com o agendamento enviado ao adotante\./);
  assert.equal(audits.at(-1).action, 'agendar');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'bia@example.org');
  assert.equal(sent[0].subject, 'Visita agendada: adoção de Nino');
  assert.match(sent[0].text, /Olá, Bia!/);
  assert.match(sent[0].text, /Data: sábado, 10\/10\/2026\nHorário: 14:00 \(horário de Brasília\)/);
  assert.match(sent[0].html, /Rua das Flores, 10 &lt;b&gt;/);
});

test('an interview leaves "novo" for analysis, and a missing SMTP keeps the schedule saved', async () => {
  const { service, requests, adopters } = setup();

  const result = await service.schedule('pedido-2', { tipo: 'entrevista', data_hora: '2026-10-06T09:30', enviar_email: true }, actor);

  assert.equal(result.pedido.status, 'em_analise');
  assert.equal(adopters.get('adotante-2').status, 'em_analise');
  assert.equal(result.email.enviado, false);
  assert.match(result.email.motivo, /não está configurado/);
  assert.match(requests.get('pedido-2').observacoes, /Entrevista agendada para terça-feira, 06\/10\/2026 às 09:30\./);
  assert.match(requests.get('pedido-2').observacoes, /E-mail com o agendamento não enviado\./);
});

test('a failing mail server does not undo the schedule, and nothing is sent when not asked', async () => {
  const failing = { isConfigured: () => true, send: async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); } };
  const { service, requests } = setup({ mailer: failing });

  const failed = await service.schedule('pedido-1', { tipo: 'visita', data_hora: '2026-10-07T10:00', enviar_email: true }, actor);
  assert.equal(failed.pedido.status, 'visita_agendada');
  assert.deepEqual(failed.email, { enviado: false, motivo: 'O servidor de e-mail recusou ou não respondeu ao envio.' });

  const silent = await service.schedule('pedido-2', { tipo: 'entrevista', data_hora: '2026-10-07T11:00' }, actor);
  assert.equal(silent.email, null);
  assert.doesNotMatch(requests.get('pedido-2').observacoes, /E-mail/);
});

test('schedules must be in the future and only for open requests', async () => {
  const { service } = setup();

  await assert.rejects(
    service.schedule('pedido-1', { tipo: 'visita', data_hora: '2026-10-04T11:59' }, actor),
    { status: 422, code: 'DATA_NO_PASSADO' }
  );
  await service.reject('pedido-1', { justificativa: 'Família desistiu da adoção.' }, actor);
  await assert.rejects(
    service.schedule('pedido-1', { tipo: 'visita', data_hora: '2026-10-10T14:00' }, actor),
    { status: 409, code: 'PEDIDO_ENCERRADO' }
  );
});
