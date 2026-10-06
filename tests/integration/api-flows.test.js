const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');
require('../../src/config/env');
const pool = require('../../src/db/db');
const app = require('../../src/app');
const { withRollback } = require('../helpers/db-transaction');

const PASSWORD = 'Integracao-Teste-123';
const NEW_PASSWORD = 'Integracao-Nova-456';
const EMAIL_SUFFIX = '.integracao@example.invalid';
// INTEGRACAO_BANCO_VAZIO=1 roda os fluxos num schema vazio criado pelo 000 (como no CI).
const freshSchemaSql = process.env.INTEGRACAO_BANCO_VAZIO === '1'
  ? fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '000-patas-em-casa-schema.sql'), 'utf8')
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

    async function publicAdoptionRequest(animalId, email) {
      return request('POST', '/api/v1/public/adoption-requests', {
        auth: false,
        body: {
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

        const signed = await request('POST', `/api/v1/adoption-requests/${firstRequest.id}/term-signed`);
        assert.equal(signed.data.data.termo_assinado, true);

        const revealed = await request('POST', `/api/v1/adoption-requests/${secondRequest.id}/reveal`);
        assert.equal(revealed.data.data.adotante.email, `segundo${EMAIL_SUFFIX}`);
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
