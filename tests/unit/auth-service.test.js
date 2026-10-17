/*
 * ============================================================================
 * ARQUIVO: auth-service.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do login e da verificação do usuário atual (auth-service): token
 *   curto e sem dados sensíveis, mesma mensagem para e-mail inexistente e senha
 *   errada, conta inativa bloqueada.
 *
 * PRINCIPAIS ITENS:
 *   - activeAdmin: administrador de exemplo.
 *   - 4 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/auth/auth-service.js (createAuthService), src/config/env, src/utils/app-error.
 *   - tests/helpers/fake-sessions.js.
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// JWT (para abrir o token gerado e conferir o conteúdo).
const jwt = require('jsonwebtoken');
// Configuração (segredo do JWT).
const { readConfig } = require('../../src/config/env');
// Classe de erro.
const AppError = require('../../src/utils/app-error');
// Fábrica do service.
const { createAuthService } = require('../../src/modules/auth/auth-service');
// Sessões em memória.
const { createFakeSessions } = require('../helpers/fake-sessions');

// Administrador de exemplo (o hash é um texto qualquer; a comparação é simulada).
const activeAdmin = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  nome: 'Admin de teste',
  email: 'admin@example.org',
  senha_hash: 'stored-hash',
  cargo: 'administrador',
  ativo: true,
};

// Teste 1: login normaliza o e-mail, gera token de até 15 min, inclui permissões e não devolve o hash.
test('login reads the user from the repository and returns a short-lived safe user', async () => {
  const service = createAuthService({
    repository: {
      findByEmail: async (email) => (email === activeAdmin.email ? activeAdmin : null),
      findById: async (id) => (id === activeAdmin.id ? activeAdmin : null),
    },
    // Comparação falsa: só aceita a senha "correct password" com o hash esperado.
    comparePassword: async (password, passwordHash) => (
      password === 'correct password' && passwordHash === activeAdmin.senha_hash
    ),
    sessions: createFakeSessions(),
  });

  // E-mail com espaços e maiúsculas: o service precisa normalizar.
  const result = await service.login({ email: ' ADMIN@example.org ', password: 'correct password' });
  const token = jwt.verify(result.token, readConfig().jwtSecret);

  assert.equal(token.sub, activeAdmin.id);
  // exp (expira em) − iat (emitido em) ≤ 15 minutos.
  assert.ok(token.exp - token.iat <= 15 * 60);
  assert.equal(result.user.cargo, 'administrador');
  assert.ok(result.user.permissions.includes('team:update'));
  assert.ok(result.refreshToken);
  assert.equal(Object.hasOwn(result.user, 'senha_hash'), false);
});

// Teste 2: e-mail inexistente → mesmo erro 401 genérico (não revela que o e-mail não existe).
test('login gives the same invalid-credentials error for missing users and wrong passwords', async () => {
  const service = createAuthService({
    repository: { findByEmail: async () => null },
    comparePassword: async () => false,
  });

  await assert.rejects(service.login({ email: 'unknown@example.org', password: 'wrong' }), (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'CREDENCIAIS_INVALIDAS');
    return true;
  });
});

// Teste 3: conta inativa não entra, mesmo com a senha certa.
test('inactive users cannot authenticate even with a matching password', async () => {
  const service = createAuthService({
    repository: { findByEmail: async () => ({ ...activeAdmin, ativo: false }) },
    comparePassword: async () => true,
  });

  await assert.rejects(service.login({ email: activeAdmin.email, password: 'correct password' }), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'CREDENCIAIS_INVALIDAS');
    return true;
  });
});

// Teste 4: /me de uma conta desativada → 401 SESSAO_INVALIDA.
test('current user lookup revokes access to a disabled account', async () => {
  const service = createAuthService({
    repository: { findById: async () => ({ ...activeAdmin, ativo: false }) },
  });

  await assert.rejects(service.getCurrentUser(activeAdmin.id), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'SESSAO_INVALIDA');
    return true;
  });
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada teste cria o auth-service com repository e comparação de senha falsos e
 *   confere o resultado do login/getCurrentUser (token, permissões, erros).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testar autenticação sem banco e sem bcrypt real (dublês).
 *   - Campos padrão do JWT: sub, iat, exp.
 *   - Mensagens de erro que não vazam informação.
 * ============================================================================
 */
