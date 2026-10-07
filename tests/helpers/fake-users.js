const userRepository = require('../../src/modules/users/user-repository');
const { signToken } = require('../../src/middleware/auth');

// Um usuário fictício por cargo; o middleware de autenticação consulta o "banco" a cada requisição.
const fakeUsers = {
  administrador: { id: '11111111-1111-4111-8111-111111111111', nome: 'Admin de teste', email: 'admin@example.org', cargo: 'administrador', ativo: true },
  gestor_animais: { id: '22222222-2222-4222-8222-222222222222', nome: 'Gestor de teste', email: 'gestor@example.org', cargo: 'gestor_animais', ativo: true },
  financeiro: { id: '33333333-3333-4333-8333-333333333333', nome: 'Financeiro de teste', email: 'financeiro@example.org', cargo: 'financeiro', ativo: true },
  voluntariado: { id: '44444444-4444-4444-8444-444444444444', nome: 'Voluntário de teste', email: 'voluntario@example.org', cargo: 'voluntariado', ativo: true },
  inativo: { id: '55555555-5555-4555-8555-555555555555', nome: 'Inativo de teste', email: 'inativo@example.org', cargo: 'administrador', ativo: false },
};

function useFakeUsers() {
  const originalFindById = userRepository.findById;
  userRepository.findById = async (id) => Object.values(fakeUsers).find((user) => user.id === id) || null;
  return () => {
    userRepository.findById = originalFindById;
  };
}

function tokenFor(key, claims = {}) {
  const user = fakeUsers[key];
  return signToken({ sub: user.id, email: user.email, role: user.cargo, nome: user.nome, ...claims });
}

module.exports = { fakeUsers, useFakeUsers, tokenFor };
