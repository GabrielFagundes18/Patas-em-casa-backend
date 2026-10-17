/*
 * ============================================================================
 * ARQUIVO: user-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do user-service (equipe): senha forte obrigatória e e-mail único no
 *   cadastro, bloqueio de auto-rebaixamento/auto-desativação, proteção do último
 *   administrador, convite por e-mail no lugar da senha e encerramento das
 *   sessões ao desativar ou redefinir a senha.
 *
 * PRINCIPAIS ITENS:
 *   - ADMIN_ID, OTHER_ADMIN_ID.
 *   - setup({ admins }): "banco" de usuários em memória + dublês de auditoria, hash, sessões e convites.
 *   - 5 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/users/user-service.js e tests/helpers/fake-sessions.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Fábrica do service.
const { createUserService } = require('../../src/modules/users/user-service');
// Sessões em memória.
const { createFakeSessions } = require('../helpers/fake-sessions');

// Ids dos administradores de exemplo.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ADMIN_ID = '66666666-6666-4666-8666-666666666666';

/*
 * FUNÇÃO: setup
 * O que faz: cria um "banco" de usuários (Map) com 1 ou 2 administradores e o service com dublês:
 *   - create lança erro com code '23505' para e-mail repetido (como o PostgreSQL);
 *   - hashPassword devolve "hash:<senha>" (rápido, sem bcrypt);
 *   - accessLinks.send registra o convite em "invites".
 * Retorno: { service, users, audits, sessions, invites }.
 */
function setup({ admins = 1 } = {}) {
  const users = new Map([[ADMIN_ID, { id: ADMIN_ID, nome: 'Carla', email: 'carla@example.org', cargo: 'administrador', ativo: true }]]);
  if (admins > 1) users.set(OTHER_ADMIN_ID, { id: OTHER_ADMIN_ID, nome: 'Rui', email: 'rui@example.org', cargo: 'administrador', ativo: true });
  const audits = [];
  const repository = {
    findById: async (id) => (users.has(id) ? { ...users.get(id) } : null),
    create: async (user) => {
      if ([...users.values()].some((existing) => existing.email === user.email)) {
        // Object.assign acrescenta "code" ao objeto de erro.
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      }
      const created = { id: '77777777-7777-4777-8777-777777777777', nome: user.nome, email: user.email, cargo: user.cargo, ativo: user.ativo };
      users.set(created.id, created);
      return { ...created };
    },
    // Aplica as mudanças e devolve uma cópia ("&&" devolve o 2º valor quando o 1º é verdadeiro).
    update: async (id, changes) => Object.assign(users.get(id), changes) && { ...users.get(id) },
    updatePassword: async () => true,
    countActiveAdministrators: async () => [...users.values()].filter((user) => user.cargo === 'administrador' && user.ativo).length,
  };
  const sessions = createFakeSessions();
  const invites = [];
  const service = createUserService(repository, {
    audit: { record: async (event) => audits.push(event) },
    hashPassword: async (password) => `hash:${password}`,
    sessions,
    accessLinks: { send: async (user, finalidade) => invites.push({ user, finalidade }) && { enviado: true } },
  });
  return { service, users, audits, sessions, invites };
}

// Teste 1: senha fraca → 422; cadastro válido normaliza e-mail, traz permissões e não expõe hash; e-mail repetido → 409.
test('team members are created with a strong password and listed permissions', async () => {
  const { service, audits } = setup();

  await assert.rejects(
    service.create({ nome: 'João', email: 'joao@example.org', cargo: 'gestor_animais', senha: 'fraca' }, { userId: ADMIN_ID }),
    { status: 422, code: 'SENHA_FRACA' }
  );

  const created = await service.create({ nome: ' João ', email: 'JOAO@example.org', cargo: 'gestor_animais', senha: 'senha forte 123' }, { userId: ADMIN_ID });
  assert.equal(created.email, 'joao@example.org');
  assert.ok(created.permissions.includes('animals:update'));
  assert.equal(Object.hasOwn(created, 'senha_hash'), false);
  assert.equal(audits[0].action, 'criar');

  await assert.rejects(
    service.create({ nome: 'Outro', email: 'joao@example.org', cargo: 'financeiro', senha: 'senha forte 123' }, {}),
    { status: 409, code: 'EMAIL_EM_USO' }
  );
});

// Teste 2: o administrador não pode se desativar nem mudar o próprio cargo.
test('administrators cannot demote or deactivate themselves', async () => {
  const { service } = setup({ admins: 2 });
  await assert.rejects(service.update(ADMIN_ID, { ativo: false }, { userId: ADMIN_ID }), { status: 409, code: 'ALTERACAO_PROPRIA_BLOQUEADA' });
  await assert.rejects(service.update(ADMIN_ID, { cargo: 'financeiro' }, { userId: ADMIN_ID }), { status: 409, code: 'ALTERACAO_PROPRIA_BLOQUEADA' });
});

// Teste 3: com 1 administrador, desativá-lo → 409; com 2, funciona e a auditoria guarda o "antes".
test('the last active administrator cannot be removed', async () => {
  const single = setup();
  await assert.rejects(single.service.update(ADMIN_ID, { ativo: false }, { userId: OTHER_ADMIN_ID }), { status: 409, code: 'ULTIMO_ADMINISTRADOR' });

  const pair = setup({ admins: 2 });
  const updated = await pair.service.update(ADMIN_ID, { ativo: false }, { userId: OTHER_ADMIN_ID });
  assert.equal(updated.ativo, false);
  assert.deepEqual(pair.audits[0].before, { ativo: true });
});

// Teste 4: cadastro com convite (sem senha) envia o convite e as permissões batem com o cargo gestor_ong.
test('a new member can receive an invite instead of an initial password', async () => {
  const { service, invites } = setup();

  const created = await service.create(
    { nome: 'Davi Rocha', email: 'davi@example.org', cargo: 'gestor_ong', enviar_convite: true },
    { userId: ADMIN_ID }
  );

  assert.deepEqual(created.convite, { enviado: true });
  assert.equal(invites.length, 1);
  assert.equal(invites[0].finalidade, 'convite');
  assert.equal(invites[0].user.email, 'davi@example.org');
  assert.ok(created.permissions.includes('animals:delete'));
  assert.equal(created.permissions.includes('team:read'), false);
});

// Teste 5: redefinir senha e desativar encerram as sessões; convite para usuário inativo → 409.
test('deactivating a member or resetting their password ends all their sessions', async () => {
  const { service, sessions } = setup({ admins: 2 });
  // Sessão válida por 1 hora (3600000 ms).
  const first = await sessions.create({ usuarioId: OTHER_ADMIN_ID, expiraEm: new Date(Date.now() + 3600000) });
  await service.resetPassword(OTHER_ADMIN_ID, { nova_senha: 'NovaSenhaForte123' }, { userId: ADMIN_ID });
  assert.equal(await sessions.findActive(first), null);

  const second = await sessions.create({ usuarioId: OTHER_ADMIN_ID, expiraEm: new Date(Date.now() + 3600000) });
  await service.update(OTHER_ADMIN_ID, { ativo: false }, { userId: ADMIN_ID });
  assert.equal(await sessions.findActive(second), null);
  await assert.rejects(service.sendInvite(OTHER_ADMIN_ID, { userId: ADMIN_ID }), { status: 409, code: 'USUARIO_INATIVO' });
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   setup() cria um "banco" em memória com 1 ou 2 administradores; os testes
 *   exercitam as regras de segurança da equipe e conferem erros, auditoria,
 *   convites e sessões.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Simular erros do banco (code '23505') com Object.assign.
 *   - Testar regras de "não se trancar para fora" do sistema.
 *   - Dublês simples para hash de senha (testes rápidos).
 * ============================================================================
 */
