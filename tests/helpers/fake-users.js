/*
 * ============================================================================
 * ARQUIVO: fake-users.js (auxiliar de testes)
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Fornece USUÁRIOS FICTÍCIOS (um por cargo, mais um inativo) e funções para:
 *     - fazer o middleware de autenticação "encontrar" esses usuários sem banco;
 *     - gerar tokens JWT válidos para eles.
 *   Assim os testes de HTTP conseguem simular requisições de cada cargo.
 *
 * PRINCIPAIS ITENS:
 *   - fakeUsers: os usuários de teste (exportado).
 *   - useFakeUsers(): troca userRepository.findById por uma busca na lista (exportada).
 *   - tokenFor(key, claims): token JWT para um dos usuários (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/modules/users/user-repository e src/middleware/auth (signToken).
 *   - Usado por: tests/unit/http-*.test.js e outros testes de rotas.
 * ============================================================================
 */

// Repository real (uma das funções dele será trocada temporariamente).
const userRepository = require('../../src/modules/users/user-repository');
// Cria tokens de acesso.
const { signToken } = require('../../src/middleware/auth');

// Um usuário fictício por cargo; o middleware de autenticação consulta o "banco" a cada requisição.
// Os ids são UUIDs válidos (o middleware recusa ids fora do formato).
const fakeUsers = {
  administrador: { id: '11111111-1111-4111-8111-111111111111', nome: 'Admin de teste', email: 'admin@example.org', cargo: 'administrador', ativo: true },
  gestor_animais: { id: '22222222-2222-4222-8222-222222222222', nome: 'Gestor de teste', email: 'gestor@example.org', cargo: 'gestor_animais', ativo: true },
  financeiro: { id: '33333333-3333-4333-8333-333333333333', nome: 'Financeiro de teste', email: 'financeiro@example.org', cargo: 'financeiro', ativo: true },
  voluntariado: { id: '44444444-4444-4444-8444-444444444444', nome: 'Voluntário de teste', email: 'voluntario@example.org', cargo: 'voluntariado', ativo: true },
  inativo: { id: '55555555-5555-4555-8555-555555555555', nome: 'Inativo de teste', email: 'inativo@example.org', cargo: 'administrador', ativo: false },
};

/*
 * FUNÇÃO: useFakeUsers
 * O que faz: substitui userRepository.findById por uma busca em fakeUsers.
 * Retorno (função): chame-a no fim do teste para restaurar a função original.
 */
function useFakeUsers() {
  const originalFindById = userRepository.findById;
  userRepository.findById = async (id) => Object.values(fakeUsers).find((user) => user.id === id) || null;
  return () => {
    userRepository.findById = originalFindById;
  };
}

/*
 * FUNÇÃO: tokenFor
 * O que faz: gera um token de acesso para o usuário de teste indicado.
 * Parâmetros: key ('administrador', 'financeiro'...) e claims extras (opcional, ex.: { sid }).
 */
function tokenFor(key, claims = {}) {
  const user = fakeUsers[key];
  return signToken({ sub: user.id, email: user.email, role: user.cargo, nome: user.nome, ...claims });
}

// Exporta os itens.
module.exports = { fakeUsers, useFakeUsers, tokenFor };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   No início do teste: const restore = useFakeUsers(); depois, requisições com
 *   "Authorization: Bearer " + tokenFor('financeiro'); no fim: restore().
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Substituir dependências em testes e restaurá-las depois.
 *   - Dados de teste (fixtures) e e-mails de exemplo (example.org, domínio reservado).
 * ============================================================================
 */
