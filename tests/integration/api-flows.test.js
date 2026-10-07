const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const fsSync = require('node:fs');
const pathModule = require('node:path');

// Fotos do teste vão para uma pasta temporária (a configuração é lida quando o app é carregado).
process.env.UPLOAD_DIR = fsSync.mkdtempSync(pathModule.join(os.tmpdir(), 'patas-integracao-uploads-'));
test.after(() => fsSync.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true }));
const bcrypt = require('bcryptjs');
require('../../src/config/env');
const pool = require('../../src/db/pool');
const app = require('../../src/app');
const { withRollback } = require('../helpers/db-transaction');
const { readOrder } = require('../../scripts/migrar');
const accessLinks = require('../../src/modules/auth/access-link-service');
const { createOnlineDonationService } = require('../../src/services/donations/online-donation-service');

const PASSWORD = 'Integracao-Teste-123';
const NEW_PASSWORD = 'Integracao-Nova-456';
const EMAIL_SUFFIX = '.integracao@example.invalid';
// INTEGRACAO_BANCO_VAZIO=1 roda os fluxos num schema vazio criado pelas migrations de migrations/ordem.json.
const freshSchemaSql = process.env.INTEGRACAO_BANCO_VAZIO === '1'
  ? readOrder().map((migration) => migration.sql).join('\n')
  : undefined;

// Todos os fluxos rodam no banco real dentro de uma transação desfeita ao final (withRollback).
test('fluxos completos da API v1 no banco real, sem deixar dados gravados', { skip: !process.env.DATABASE_URL && 'DATABASE_URL não configurada' }, async (t) => {
  await withRollback(async (db) => {
    const server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    let token;

    async function request(method, path, { body, auth = true, headers = {} } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const type = response.headers.get('content-type') || '';
      const data = type.includes('json') ? await response.json() : await response.text();
      return { status: response.status, data, headers: response.headers };
    }

    async function createAnimal(nome, extra = {}) {
      const response = await request('POST', '/api/v1/animals', { body: { nome, especie: 'cachorro', porte: 'medio', sexo: 'macho', ...extra } });
      assert.equal(response.status, 201, JSON.stringify(response.data));
      return response.data.data;
    }

    async function publicAdoptionRequest(animalId, email, extra = {}) {
      return request('POST', '/api/v1/public/adoption-requests', {
        auth: false,
        body: {
          ...extra,
          animal_id: animalId,
          nome: 'Candidato de Integração',
          email,
          telefone: '(11) 98888-7777',
          cidade: 'Campinas',
          rotina: 'Casa com quintal e rotina tranquila.',
          ambiente_seguro: true,
          ciente_pos_adocao: true,
        },
      });
    }

    try {
      const hash = await bcrypt.hash(PASSWORD, 10);
      const insertUser = (prefix, cargo) => db.query(
        'INSERT INTO usuarios (nome, email, senha_hash, cargo) VALUES ($1, $2, $3, $4) RETURNING id',
        [`Usuário ${prefix} de integração`, `${prefix}${EMAIL_SUFFIX}`, hash, cargo]
      );
      const admin = (await insertUser('admin', 'administrador')).rows[0];
      const manager = (await insertUser('gestor', 'gestor_animais')).rows[0];

      await t.test('login, renovação por cookie, /me e troca de senha', async () => {
        const login = await request('POST', '/api/v1/auth/login', { auth: false, body: { email: `ADMIN${EMAIL_SUFFIX}`, password: PASSWORD } });
        assert.equal(login.status, 200);
        token = login.data.data.token;
        const cookie = login.headers.get('set-cookie');
        assert.match(cookie, /patas_refresh=.+; Max-Age=\d+; Path=\/api\/v1\/auth; HttpOnly; SameSite=Strict/);

        const refresh = await request('POST', '/api/v1/auth/refresh', {
          auth: false,
          headers: { Cookie: cookie.split(';')[0], 'X-Requested-With': 'XMLHttpRequest' },
        });
        assert.equal(refresh.status, 200);
        token = refresh.data.data.token;

        const me = await request('GET', '/api/v1/me');
        assert.equal(me.data.data.cargo, 'administrador');

        const change = await request('PATCH', '/api/v1/me/password', { body: { senha_atual: PASSWORD, nova_senha: NEW_PASSWORD } });
        assert.equal(change.status, 204);
        const oldPassword = await request('POST', '/api/v1/auth/login', { auth: false, body: { email: `admin${EMAIL_SUFFIX}`, password: PASSWORD } });
        assert.equal(oldPassword.status, 401);
        const newPassword = await request('POST', '/api/v1/auth/login', { auth: false, body: { email: `admin${EMAIL_SUFFIX}`, password: NEW_PASSWORD } });
        assert.equal(newPassword.status, 200);
      });

      await t.test('sessões revogáveis, esqueci a senha, link de redefinição e convite', async () => {
        const mainToken = token;
        const login = await request('POST', '/api/v1/auth/login', { auth: false, body: { email: `admin${EMAIL_SUFFIX}`, password: NEW_PASSWORD } });
        const cookie = login.headers.get('set-cookie').split(';')[0];
        token = login.data.data.token;
        assert.equal((await request('GET', '/api/v1/me')).status, 200);

        const logout = await request('POST', '/api/v1/auth/logout', { auth: false, headers: { Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest' } });
        assert.equal(logout.status, 204);
        assert.equal((await request('GET', '/api/v1/me')).status, 401);
        const refreshAfterLogout = await request('POST', '/api/v1/auth/refresh', { auth: false, headers: { Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest' } });
        assert.equal(refreshAfterLogout.status, 401);
        token = mainToken;
        assert.equal((await request('GET', '/api/v1/me')).status, 200);

        const forgot = await request('POST', '/api/v1/auth/forgot-password', { auth: false, body: { email: 'ninguem@example.invalid' } });
        assert.equal(forgot.status, 202);
        const invalidLink = await request('POST', '/api/v1/auth/reset-password', { auth: false, body: { token: 'x'.repeat(43), nova_senha: 'OutraSenha2026' } });
        assert.equal(invalidLink.status, 400);
        assert.equal(invalidLink.data.error.code, 'LINK_INVALIDO');

        const invited = await request('POST', '/api/v1/users', {
          body: { nome: 'Convidada de integração', email: `convite${EMAIL_SUFFIX}`, cargo: 'gestor_ong', enviar_convite: true },
        });
        assert.equal(invited.status, 201);
        assert.equal(typeof invited.data.data.convite.enviado, 'boolean');

        const { url } = await accessLinks.issue({ id: invited.data.data.id }, 'convite');
        const inviteToken = new URL(url).searchParams.get('token');
        const defined = await request('POST', '/api/v1/auth/reset-password', { auth: false, body: { token: inviteToken, nova_senha: 'SenhaDoConvite2026' } });
        assert.equal(defined.status, 200);
        const reused = await request('POST', '/api/v1/auth/reset-password', { auth: false, body: { token: inviteToken, nova_senha: 'SenhaDoConvite2026' } });
        assert.equal(reused.status, 400);
        const invitedLogin = await request('POST', '/api/v1/auth/login', { auth: false, body: { email: `convite${EMAIL_SUFFIX}`, password: 'SenhaDoConvite2026' } });
        assert.equal(invitedLogin.status, 200);
        assert.equal(invitedLogin.data.data.user.cargo, 'gestor_ong');
        assert.equal(invitedLogin.data.data.user.permissions.includes('team:read'), false);
      });

      await t.test('animais: cadastro, máquina de estados, exportação e visão pública', async () => {
        const animal = await createAnimal('Integração Estados', { especie: 'gato', porte: 'pequeno', sexo: 'femea' });

        const withoutReason = await request('PATCH', `/api/v1/animals/${animal.id}/status`, { body: { status: 'inativo' } });
        assert.equal(withoutReason.status, 422);
        assert.equal(withoutReason.data.error.code, 'MOTIVO_OBRIGATORIO');

        const deactivated = await request('PATCH', `/api/v1/animals/${animal.id}/status`, { body: { status: 'inativo', motivo: 'Transferido para outra ONG' } });
        assert.equal(deactivated.data.data.status, 'inativo');
        const invalid = await request('PATCH', `/api/v1/animals/${animal.id}/status`, { body: { status: 'adotado' } });
        assert.equal(invalid.status, 409);
        const hiddenFromPublic = await request('GET', `/api/v1/public/animals/${animal.id}`, { auth: false });
        assert.equal(hiddenFromPublic.status, 404);

        await request('PATCH', `/api/v1/animals/${animal.id}/status`, { body: { status: 'disponivel' } });
        const publicAnimal = await request('GET', `/api/v1/public/animals/${animal.id}`, { auth: false });
        assert.equal(publicAnimal.status, 200);
        assert.equal(Object.hasOwn(publicAnimal.data.data, 'criado_em'), false);

        const csv = await request('GET', `/api/v1/animals/export?q=${encodeURIComponent('Integração Estados')}`);
        assert.equal(csv.status, 200);
        assert.match(csv.headers.get('content-type'), /text\/csv/);
        assert.match(csv.data, /Integração Estados;gato/);

        assert.equal((await request('DELETE', `/api/v1/animals/${animal.id}`)).status, 204);
        assert.equal((await request('GET', `/api/v1/animals/${animal.id}`)).status, 404);
      });

      let approvedAdopterId;
      let rejectedAdopterId;

      await t.test('fotos: upload, arquivo servido, principal, remoção e temperamento no perfil público', async () => {
        const animal = await createAnimal('Integração Fotos');
        const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf000000030101005f4f8d3f0000000049454e44ae426082', 'hex');
        const upload = async (files) => {
          const form = new FormData();
          for (const [name, content, type] of files) form.append('fotos', new Blob([content], { type }), name);
          const response = await fetch(`${baseUrl}/api/v1/animals/${animal.id}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
          return { status: response.status, data: await response.json() };
        };

        const sent = await upload([['nino.png', png, 'image/png'], ['nino-2.png', png, 'image/png']]);
        assert.equal(sent.status, 201);
        const [first, second] = sent.data.data.fotos;
        assert.equal(first.principal, true);
        assert.equal(sent.data.data.foto_url, first.url);

        const file = await fetch(`${baseUrl}${new URL(first.url).pathname}`);
        assert.equal(file.status, 200);
        assert.equal(file.headers.get('content-type'), 'image/png');
        assert.equal(file.headers.get('cross-origin-resource-policy'), 'cross-origin');

        const fake = await upload([['foto.png', Buffer.from('<script>alert(1)</script>'), 'image/png']]);
        assert.equal(fake.status, 422);
        assert.equal(fake.data.error.code, 'ARQUIVO_INVALIDO');

        const withTraits = await request('PUT', `/api/v1/animals/${animal.id}`, { body: { temperamento: ['calmo', 'convive com gatos'] } });
        assert.equal(withTraits.status, 200);
        const principal = await request('PATCH', `/api/v1/animals/${animal.id}/photos/${second.id}/principal`);
        assert.equal(principal.data.data.foto_url, second.url);
        const removed = await request('DELETE', `/api/v1/animals/${animal.id}/photos/${first.id}`);
        assert.equal(removed.data.data.fotos.length, 1);
        assert.equal((await fetch(`${baseUrl}${new URL(first.url).pathname}`)).status, 404);

        const publicView = await request('GET', `/api/v1/public/animals/${animal.id}`, { auth: false });
        assert.deepEqual(publicView.data.data.temperamento, ['calmo', 'convive com gatos']);
        assert.deepEqual(publicView.data.data.fotos.map((foto) => foto.url), [second.url]);

        await request('DELETE', `/api/v1/animals/${animal.id}`);
        assert.equal((await fetch(`${baseUrl}${new URL(second.url).pathname}`)).status, 404);
      });

      await t.test('adoção: pedido público, triagem, aprovação em transação e termo', async () => {
        const animal = await createAnimal('Integração Adoção');
        const first = await publicAdoptionRequest(animal.id, `primeiro${EMAIL_SUFFIX}`);
        const second = await publicAdoptionRequest(animal.id, `segundo${EMAIL_SUFFIX}`);
        assert.equal(first.status, 201);
        assert.match(first.data.data.protocolo, /^PAC-[0-9A-F]{8}$/);

        // Na mesma transação de teste, now() é constante: os pedidos são identificados pelo e-mail.
        const list = await request('GET', `/api/v1/adoption-requests?animal_id=${animal.id}`);
        assert.equal(list.data.meta.total, 2);
        const firstRequest = list.data.data.find((item) => item.adotante.email === 'pr***@example.invalid');
        const secondRequest = list.data.data.find((item) => item.adotante.email === 'se***@example.invalid');
        assert.ok(firstRequest && secondRequest, 'contatos devem vir mascarados');
        approvedAdopterId = firstRequest.adotante.id;
        rejectedAdopterId = secondRequest.adotante.id;

        const board = await request('GET', '/api/v1/adoption-requests/board');
        assert.ok(board.data.data.columns.find((column) => column.status === 'novo').items.some((item) => item.id === firstRequest.id));

        const moved = await request('PATCH', `/api/v1/adoption-requests/${firstRequest.id}`, {
          body: { status: 'visita_agendada', responsavel_id: manager.id, nota: 'Visita marcada para sábado.' },
        });
        assert.equal(moved.status, 200);
        assert.equal(moved.data.data.responsavel.id, manager.id);
        assert.equal(moved.data.data.adotante.status, 'visita_agendada');
        assert.doesNotMatch(moved.data.data.observacoes, /98888-7777/);

        const approved = await request('POST', `/api/v1/adoption-requests/${firstRequest.id}/approve`, {
          body: { justificativa: 'Visita aprovada, família preparada.' },
        });
        assert.equal(approved.status, 200);
        assert.equal(approved.data.data.animal.status, 'adotado');
        assert.equal(approved.data.data.adotante.status, 'adotante');

        const autoRejected = await request('GET', `/api/v1/adoption-requests/${secondRequest.id}`);
        assert.equal(autoRejected.data.data.status, 'reprovado');
        assert.match(autoRejected.data.data.observacoes, /Reprovado automaticamente/);

        const decidedAgain = await request('POST', `/api/v1/adoption-requests/${firstRequest.id}/reject`, { body: { justificativa: 'Tentativa de decidir de novo.' } });
        assert.equal(decidedAgain.status, 409);

        const adoptedProfile = await request('GET', `/api/v1/public/animals/${animal.id}`, { auth: false });
        assert.equal(adoptedProfile.status, 410);
        assert.equal(adoptedProfile.data.error.message, 'Integração Adoção já encontrou um lar.');

        const signed = await request('POST', `/api/v1/adoption-requests/${firstRequest.id}/term-signed`);
        assert.equal(signed.data.data.termo_assinado, true);

        const revealed = await request('POST', `/api/v1/adoption-requests/${secondRequest.id}/reveal`);
        assert.equal(revealed.data.data.adotante.email, `segundo${EMAIL_SUFFIX}`);
      });

      await t.test('agenda: data preferida, conflito de horário, remarcação, cancelamento e painel', async () => {
        const animal = await createAnimal('Integração Agenda');
        const created = await publicAdoptionRequest(animal.id, `agenda1${EMAIL_SUFFIX}`, { visita_preferida_em: '2099-05-10T10:00' });
        assert.equal(created.status, 201);
        const pastPreference = await publicAdoptionRequest(animal.id, `agenda9${EMAIL_SUFFIX}`, { visita_preferida_em: '2001-01-01T10:00' });
        assert.equal(pastPreference.status, 422);

        const pedido = (await request('GET', `/api/v1/adoption-requests?animal_id=${animal.id}`)).data.data[0];
        const detail = await request('GET', `/api/v1/adoption-requests/${pedido.id}`);
        assert.equal(detail.data.data.visita_preferida_em, '2099-05-10T10:00');
        assert.deepEqual(detail.data.data.agendamentos, []);

        const scheduled = await request('POST', `/api/v1/adoption-requests/${pedido.id}/schedule`, {
          body: { tipo: 'visita', data_hora: '2099-05-10T10:00', duracao_minutos: 60, responsavel_id: manager.id, local: 'Rua das Flores, 10' },
        });
        assert.equal(scheduled.status, 200);
        const visit = scheduled.data.data.agendamento;
        assert.equal(visit.responsavel.id, manager.id);
        assert.equal(visit.data_hora, '2099-05-10T10:00');
        assert.equal(scheduled.data.data.pedido.status, 'visita_agendada');

        const otherAnimal = await createAnimal('Integração Agenda 2');
        await publicAdoptionRequest(otherAnimal.id, `agenda2${EMAIL_SUFFIX}`);
        const other = (await request('GET', `/api/v1/adoption-requests?animal_id=${otherAnimal.id}`)).data.data[0];
        const conflict = await request('POST', `/api/v1/adoption-requests/${other.id}/schedule`, {
          body: { tipo: 'entrevista', data_hora: '2099-05-10T10:30', responsavel_id: manager.id },
        });
        assert.equal(conflict.status, 409);
        assert.equal(conflict.data.error.code, 'HORARIO_INDISPONIVEL');
        const backToBack = await request('POST', `/api/v1/adoption-requests/${other.id}/schedule`, {
          body: { tipo: 'entrevista', data_hora: '2099-05-10T11:00', responsavel_id: manager.id },
        });
        assert.equal(backToBack.status, 200);

        const overlapping = await request('PATCH', `/api/v1/adoption-requests/${pedido.id}/appointments/${visit.id}`, { body: { data_hora: '2099-05-10T10:45' } });
        assert.equal(overlapping.status, 409);
        const moved = await request('PATCH', `/api/v1/adoption-requests/${pedido.id}/appointments/${visit.id}`, { body: { data_hora: '2099-05-10T09:00' } });
        assert.equal(moved.status, 200);
        assert.equal(moved.data.data.agendamento.data_hora, '2099-05-10T09:00');
        assert.equal(moved.data.data.agendamento.local, 'Rua das Flores, 10');

        const summary = await request('GET', '/api/v1/dashboard/summary?atualizar=true');
        const agendaItem = summary.data.data.agenda.find((item) => item.id === visit.id);
        assert.equal(agendaItem.tipo, 'visita');
        assert.equal(new Date(agendaItem.referencia_em).toISOString(), '2099-05-10T12:00:00.000Z');

        const cancelled = await request('POST', `/api/v1/adoption-requests/${pedido.id}/appointments/${visit.id}/cancel`, { body: { motivo: 'Adotante viajou.' } });
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.data.data.pedido.status, 'em_analise');
        const completeCancelled = await request('POST', `/api/v1/adoption-requests/${pedido.id}/appointments/${visit.id}/complete`);
        assert.equal(completeCancelled.status, 409);
        const done = await request('POST', `/api/v1/adoption-requests/${other.id}/appointments/${backToBack.data.data.agendamento.id}/complete`);
        assert.equal(done.data.data.pedido.agendamentos[0].status, 'realizado');
      });

      await t.test('adoção: reprovar o último pedido devolve o animal para disponível', async () => {
        const animal = await createAnimal('Integração Reprovação');
        const created = await publicAdoptionRequest(animal.id, `terceiro${EMAIL_SUFFIX}`);
        assert.equal(created.status, 201);
        await request('PATCH', `/api/v1/animals/${animal.id}/status`, { body: { status: 'em_processo' } });

        const list = await request('GET', `/api/v1/adoption-requests?animal_id=${animal.id}`);
        const rejected = await request('POST', `/api/v1/adoption-requests/${list.data.data[0].id}/reject`, {
          body: { justificativa: 'Candidato desistiu por telefone.' },
        });
        assert.equal(rejected.data.data.status, 'reprovado');
        assert.equal(rejected.data.data.animal.status, 'disponivel');
      });

      await t.test('adotantes: mascaramento, revelação, exportação LGPD, anonimização e exclusão', async () => {
        const search = await request('GET', `/api/v1/adopters?q=${encodeURIComponent(`segundo${EMAIL_SUFFIX}`)}`);
        assert.equal(search.data.meta.total, 1);
        assert.equal(search.data.data[0].email, 'se***@example.invalid');

        const detail = await request('GET', `/api/v1/adopters/${rejectedAdopterId}`);
        assert.equal(detail.data.data.historico.pedidos[0].status, 'reprovado');

        const revealed = await request('POST', `/api/v1/adopters/${rejectedAdopterId}/reveal`);
        assert.equal(revealed.data.data.telefone, '(11) 98888-7777');

        const exported = await request('GET', `/api/v1/adopters/${rejectedAdopterId}/lgpd-export`);
        assert.equal(exported.data.data.titular.email, `segundo${EMAIL_SUFFIX}`);
        assert.match(exported.headers.get('content-disposition'), /attachment/);

        const anonymized = await request('POST', `/api/v1/adopters/${rejectedAdopterId}/anonymize`, { body: { confirmacao: 'ANONIMIZAR' } });
        assert.equal(anonymized.status, 200);
        const afterAnonymization = await request('GET', `/api/v1/adopters/${rejectedAdopterId}`);
        assert.equal(afterAnonymization.data.data.nome, 'Titular anonimizado');
        assert.equal(afterAnonymization.data.data.telefone, null);
        assert.equal(afterAnonymization.data.data.historico.pedidos[0].observacoes, '[conteúdo removido a pedido do titular (LGPD)]');
        const again = await request('POST', `/api/v1/adopters/${rejectedAdopterId}/anonymize`, { body: { confirmacao: 'ANONIMIZAR' } });
        assert.equal(again.data.error.code, 'TITULAR_JA_ANONIMIZADO');

        const removed = await request('DELETE', `/api/v1/adopters/${approvedAdopterId}`, { body: { confirmacao: 'EXCLUIR' } });
        assert.equal(removed.status, 204);
        assert.equal((await request('GET', `/api/v1/adopters/${approvedAdopterId}`)).status, 404);

        const csv = await request('GET', '/api/v1/adopters/export');
        assert.equal(csv.status, 200);
        // response.text() descarta o BOM UTF-8; a presença dele é coberta pelo teste unitário do CSV.
        assert.match(csv.data, /^ID;Nome;E-mail/);
      });

      await t.test('doações: registro, resumo pelas views, cancelamento definitivo e CSV', async () => {
        const created = await request('POST', '/api/v1/donations', {
          body: { doador_nome: 'Doador Integração', doador_email: 'doador@example.invalid', tipo: 'unica', valor: 42.5, metodo: 'pix', status: 'pendente' },
        });
        assert.equal(created.status, 201);
        assert.equal(created.data.data.valor, 42.5);
        const id = created.data.data.id;

        assert.equal((await request('PATCH', `/api/v1/donations/${id}`, { body: { status: 'confirmada' } })).data.data.status, 'confirmada');
        const summary = await request('GET', '/api/v1/donations/summary');
        assert.ok(summary.data.data.total_confirmado >= 42.5);
        const monthly = await request('GET', '/api/v1/donations/monthly?meses=3');
        assert.ok(monthly.data.data.every((row) => /^\d{4}-\d{2}$/.test(row.mes)));

        const csv = await request('GET', `/api/v1/donations/export?q=${encodeURIComponent('Doador Integração')}`);
        assert.match(csv.data, /Doador Integração;do\*\*\*@example\.invalid;unica;pix;confirmada;42,50/);

        await request('PATCH', `/api/v1/donations/${id}`, { body: { status: 'cancelada' } });
        const locked = await request('PATCH', `/api/v1/donations/${id}`, { body: { valor: 10 } });
        assert.equal(locked.data.error.code, 'DOACAO_CANCELADA');
      });

      await t.test('doações online: SQL real com gateway simulado, status público e painel', async () => {
        // Sem credenciais no ambiente de teste, as rotas públicas respondem 503.
        const unavailable = await request('POST', '/api/v1/public/donations/checkout', {
          auth: false, body: { valor: 20, nome: 'Ana Doadora', email: 'ana@example.invalid', tipo: 'unica' },
        });
        assert.equal(unavailable.status, 503);
        assert.equal(unavailable.data.error.code, 'PAGAMENTO_INDISPONIVEL');

        const remote = { payments: new Map(), preapprovals: new Map(), charges: new Map() };
        const online = createOnlineDonationService({
          config: { frontendUrl: 'https://patas.example', apiPublicUrl: 'https://api.patas.example', mercadoPago: { accessToken: 'TEST-x', webhookSecret: 'x' } },
          gateway: {
            createPreference: async () => ({ id: 'pref', init_point: 'https://mp/checkout' }),
            createPreapproval: async () => ({ id: 'pre-int', init_point: 'https://mp/assinatura' }),
            getPayment: async (id) => remote.payments.get(id),
            getPreapproval: async (id) => remote.preapprovals.get(id),
            getAuthorizedPayment: async (id) => remote.charges.get(id),
            cancelPreapproval: async () => {},
          },
          mailer: { isConfigured: () => false },
          audit: { record: async () => {} },
        });
        const { createHmac } = require('node:crypto');
        const sign = (id, requestId) => ({
          'x-request-id': requestId,
          'x-signature': `ts=1,v1=${createHmac('sha256', 'x').update(`id:${id};request-id:${requestId};ts:1;`).digest('hex')}`,
        });

        const once = await online.startCheckout({ valor: 42.5, nome: 'Ana Doadora', email: 'ana@example.invalid', tipo: 'unica' });
        remote.payments.set('5551', { id: 5551, status: 'approved', payment_type_id: 'ticket', external_reference: once.referencia });
        await online.handleWebhook({ headers: sign('5551', 'r1'), query: { 'data.id': '5551', type: 'payment' }, body: { id: 'int-n1' } });
        const publicStatus = await request('GET', `/api/v1/public/donations/status/${once.referencia}`, { auth: false });
        assert.deepEqual(publicStatus.data.data, { tipo: 'unica', status: 'confirmada', valor: 42.5 });

        const viaPanel = await request('GET', `/api/v1/donations/${once.referencia}`);
        assert.equal(viaPanel.data.data.metodo, 'boleto');
        assert.equal(viaPanel.data.data.gateway, 'mercado_pago');
        const manualEdit = await request('PATCH', `/api/v1/donations/${once.referencia}`, { body: { valor: 1 } });
        assert.equal(manualEdit.status, 409);
        assert.equal(manualEdit.data.error.code, 'DOACAO_ONLINE');

        const monthly = await online.startCheckout({ valor: 25, nome: 'Caio Mensal', email: 'caio@example.invalid', tipo: 'recorrente' });
        remote.preapprovals.set('pre-int', { id: 'pre-int', status: 'authorized', external_reference: monthly.referencia });
        await online.handleWebhook({ headers: sign('pre-int', 'r2'), query: { 'data.id': 'pre-int', type: 'subscription_preapproval' }, body: { id: 'int-n2' } });
        remote.charges.set('ap-int', { id: 'ap-int', preapproval_id: 'pre-int', transaction_amount: 25, payment: { id: 6001, status: 'approved' } });
        for (const requestId of ['r3', 'r4']) {
          await online.handleWebhook({ headers: sign('ap-int', requestId), query: { 'data.id': 'ap-int', type: 'subscription_authorized_payment' }, body: { id: `int-${requestId}` } });
        }

        const subscriptions = await request('GET', '/api/v1/donations/subscriptions?status=ativa');
        const listed = subscriptions.data.data.find((item) => item.id === monthly.referencia);
        assert.deepEqual([listed.status, listed.pagamentos_confirmados, listed.total_arrecadado], ['ativa', 1, 25]);
        const cancelled = await request('POST', `/api/v1/donations/subscriptions/${monthly.referencia}/cancel`);
        assert.equal(cancelled.status, 503);
      });

      await t.test('voluntários: áreas em transação, inscrição pública idempotente e exclusão', async () => {
        const created = await request('POST', '/api/v1/volunteers', {
          body: { nome: 'Voluntária Integração', email: `voluntaria${EMAIL_SUFFIX}`, telefone: '(11) 97777-6666', areas: ['passeios', 'eventos'] },
        });
        assert.equal(created.status, 201);
        assert.deepEqual(created.data.data.areas, ['eventos', 'passeios']);
        const id = created.data.data.id;

        const updated = await request('PATCH', `/api/v1/volunteers/${id}`, { body: { areas: ['transporte'], status: 'inativo' } });
        assert.deepEqual(updated.data.data.areas, ['transporte']);
        const filtered = await request('GET', `/api/v1/volunteers?area=transporte&q=${encodeURIComponent('Voluntária Integração')}`);
        assert.equal(filtered.data.meta.total, 1);

        const duplicate = await request('POST', '/api/v1/public/volunteers', {
          auth: false,
          body: { nome: 'Outra Pessoa', email: `voluntaria${EMAIL_SUFFIX}`, telefone: '(11) 95555-4444', areas: ['fotografia'] },
        });
        assert.equal(duplicate.data.data.protocolo, `VOL-${id.slice(0, 8).toUpperCase()}`);
        assert.deepEqual((await request('GET', `/api/v1/volunteers/${id}`)).data.data.areas, ['transporte']);

        const applied = await request('POST', '/api/v1/public/volunteers', {
          auth: false,
          body: { nome: 'Novo Voluntário Integração', email: `novo.voluntario${EMAIL_SUFFIX}`, telefone: '(11) 94444-3333', areas: ['fotografia'] },
        });
        assert.equal(applied.status, 201);
        const pending = await request('GET', `/api/v1/volunteers?q=${encodeURIComponent('Novo Voluntário Integração')}`);
        assert.equal(pending.data.data[0].status, 'inativo');

        assert.equal((await request('DELETE', `/api/v1/volunteers/${id}`)).status, 204);
      });

      await t.test('histórias: só aparecem no site depois de publicadas e sem dados do adotante', async () => {
        const created = await request('POST', '/api/v1/stories', {
          body: { autor_nome: 'Autora Integração', texto: 'Uma história de teste com mais de dez caracteres.', publicado: false },
        });
        assert.equal(created.status, 201);
        const id = created.data.data.id;

        const before = await request('GET', '/api/v1/public/stories?pageSize=100', { auth: false });
        assert.equal(before.data.data.some((story) => story.id === id), false);

        await request('PATCH', `/api/v1/stories/${id}`, { body: { publicado: true } });
        const after = await request('GET', '/api/v1/public/stories?pageSize=100', { auth: false });
        const story = after.data.data.find((item) => item.id === id);
        assert.ok(story);
        assert.equal(Object.hasOwn(story, 'adotante_id'), false);

        assert.equal((await request('DELETE', `/api/v1/stories/${id}`)).status, 204);
      });

      await t.test('equipe: política de senha, proteções do administrador e desativação', async () => {
        const weak = await request('POST', '/api/v1/users', {
          body: { nome: 'Novo Integração', email: `novo${EMAIL_SUFFIX}`, cargo: 'voluntariado', senha: 'curta' },
        });
        assert.equal(weak.data.error.code, 'SENHA_FRACA');

        const created = await request('POST', '/api/v1/users', {
          body: { nome: 'Novo Integração', email: `novo${EMAIL_SUFFIX}`, cargo: 'voluntariado', senha: 'Senha-Integracao-789' },
        });
        assert.equal(created.status, 201);
        const duplicated = await request('POST', '/api/v1/users', {
          body: { nome: 'Outro', email: `novo${EMAIL_SUFFIX}`, cargo: 'financeiro', senha: 'Senha-Integracao-789' },
        });
        assert.equal(duplicated.data.error.code, 'EMAIL_EM_USO');

        const selfDeactivation = await request('PATCH', `/api/v1/users/${admin.id}`, { body: { ativo: false } });
        assert.equal(selfDeactivation.data.error.code, 'ALTERACAO_PROPRIA_BLOQUEADA');

        const deactivated = await request('PATCH', `/api/v1/users/${created.data.data.id}`, { body: { ativo: false } });
        assert.equal(deactivated.data.data.ativo, false);
        const blockedLogin = await request('POST', '/api/v1/auth/login', { auth: false, body: { email: `novo${EMAIL_SUFFIX}`, password: 'Senha-Integracao-789' } });
        assert.equal(blockedLogin.status, 401);
      });

      await t.test('dashboard e conteúdo público', async () => {
        const summary = await request('GET', '/api/v1/dashboard/summary?atualizar=true');
        assert.equal(summary.status, 200);
        assert.equal(summary.data.data.series_mensais.length, 12);
        assert.ok(summary.data.data.indicadores.total_animais >= 1);

        const steps = await request('GET', '/api/v1/public/adoption-steps', { auth: false });
        assert.ok(Array.isArray(steps.data.data));
        const animals = await request('GET', '/api/v1/public/animals?pageSize=100', { auth: false });
        assert.ok(animals.data.data.every((animal) => ['disponivel', 'urgente'].includes(animal.status)));
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }, { freshSchemaSql });

  const leftovers = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios WHERE email LIKE $1', [`%${EMAIL_SUFFIX}`]);
  assert.equal(leftovers.rows[0].total, 0, 'a transação de teste deveria ter sido desfeita');
  await pool.end();
});
