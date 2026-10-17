/*
 * ============================================================================
 * ARQUIVO: permissions.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define a MATRIZ DE PERMISSÕES do painel: para cada cargo (administrador,
 *   gestor da ONG, veterinário/cuidador, financeiro, voluntário), quais AÇÕES ele
 *   pode fazer em cada MÓDULO (animais, adoções, doações...). Cada permissão vira
 *   um texto no formato "modulo:acao" (ex.: "animals:create").
 *   - O backend usa essas permissões para liberar ou bloquear rotas.
 *   - O frontend recebe a lista (via /api/v1/me) para mostrar só os menus e
 *     botões permitidos.
 *
 * PRINCIPAIS ITENS:
 *   - moduleActions: todas as ações existentes em cada módulo.
 *   - roleMatrix: o que cada cargo pode fazer.
 *   - roleLabels: nomes amigáveis dos cargos (exportado).
 *   - permissionsByRole: lista "achatada" de permissões por cargo (calculada).
 *   - hasPermission(role, permission): o cargo tem a permissão? (exportada)
 *   - getPermissionsForRole(role): lista de permissões do cargo (exportada).
 *   - getPermissionMatrix(): matriz completa para a rota /permissions (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: src/middleware/auth.js (requirePermission), módulo auth (/me),
 *     modules/permissions/permission-routes.js e scripts/gerar-doc-permissoes.js
 *     (que gera docs/permissoes.md a partir daqui).
 *   - Os cargos precisam bater com config/domain-values.js (user.roles) e com o banco.
 * ============================================================================
 */

// Matriz única de permissões (módulo × ação). Toda rota protegida usa requirePermission('modulo:acao')
// e /api/v1/me devolve a lista achatada para o frontend montar menu, rotas e botões.
// Ações: read (ver), create (criar), update (editar), delete (excluir), approve (aprovar/decidir),
// export (exportar), reveal (revelar dado pessoal mascarado).
// Object.freeze: "congela" o objeto, impedindo que alguém altere a matriz por engano em outro arquivo.
const moduleActions = Object.freeze({
  // Painel inicial (indicadores): só ver.
  dashboard: ['read'],
  // Animais: ver, criar, editar, excluir e exportar.
  animals: ['read', 'create', 'update', 'delete', 'export'],
  // Pedidos de adoção: ver, editar e aprovar/reprovar.
  adoptions: ['read', 'update', 'approve'],
  // Adotantes: ver, editar, revelar dados pessoais mascarados e exportar.
  adopters: ['read', 'update', 'reveal', 'export'],
  // LGPD: aprovar pedidos de anonimização/exclusão de dados do titular.
  lgpd: ['approve'],
  // Doações.
  donations: ['read', 'create', 'update', 'export'],
  // Voluntários.
  volunteers: ['read', 'create', 'update', 'delete'],
  // Histórias de adoção.
  stories: ['read', 'create', 'update', 'delete'],
  // Equipe e acessos (usuários do painel).
  team: ['read', 'create', 'update'],
});

// Cargos do banco: administrador (Super Admin), gestor_ong (Gestor da ONG), gestor_animais
// (Veterinário/Cuidador), financeiro (Atendimento e Doações) e voluntariado (Voluntário).
const roleMatrix = Object.freeze({
  // O administrador pode tudo: recebe a lista completa de ações.
  administrador: moduleActions,
  // Toda a operação da ONG, menos equipe/acessos e as decisões LGPD (anonimizar/excluir titular),
  // que são irreversíveis e ficam com o administrador.
  gestor_ong: {
    dashboard: ['read'],
    animals: ['read', 'create', 'update', 'delete', 'export'],
    adoptions: ['read', 'update', 'approve'],
    adopters: ['read', 'update', 'reveal', 'export'],
    donations: ['read', 'create', 'update', 'export'],
    volunteers: ['read', 'create', 'update', 'delete'],
    stories: ['read', 'create', 'update', 'delete'],
  },
  // Veterinário/cuidador: cuida dos animais e das adoções; não exclui animais nem vê doações.
  gestor_animais: {
    dashboard: ['read'],
    animals: ['read', 'create', 'update', 'export'],
    adoptions: ['read', 'update', 'approve'],
    adopters: ['read', 'reveal'],
    volunteers: ['read'],
    stories: ['read', 'create', 'update'],
  },
  // Financeiro/atendimento: doações e contato com adotantes; não decide adoções.
  financeiro: {
    dashboard: ['read'],
    adoptions: ['read', 'update'],
    adopters: ['read', 'update', 'reveal', 'export'],
    donations: ['read', 'create', 'update', 'export'],
  },
  // Voluntário: acesso mais restrito (vê animais e histórias; cuida do cadastro de voluntários).
  voluntariado: {
    dashboard: ['read'],
    animals: ['read'],
    volunteers: ['read', 'create', 'update'],
    stories: ['read'],
  },
});

// Nomes amigáveis de cada cargo (usados em documentação e mensagens).
const roleLabels = Object.freeze({
  administrador: 'Administrador (Super Admin)',
  gestor_ong: 'Gestor da ONG',
  gestor_animais: 'Gestor de animais (Veterinário/Cuidador)',
  financeiro: 'Financeiro (Atendimento e Doações)',
  voluntariado: 'Voluntariado (Voluntário)',
});

// Transforma a matriz em listas simples por cargo. Exemplo de resultado:
//   { voluntariado: ['dashboard:read', 'animals:read', 'volunteers:read', ...], ... }
// - Object.entries(obj) → lista de pares [chave, valor].
// - Object.fromEntries(lista) → faz o caminho inverso (pares → objeto).
// - flatMap: como map, mas "achata" um nível (listas de listas viram uma lista só).
const permissionsByRole = Object.freeze(Object.fromEntries(
  Object.entries(roleMatrix).map(([role, modules]) => [
    role,
    Object.entries(modules).flatMap(([module, actions]) => actions.map((action) => `${module}:${action}`)),
  ])
));

/*
 * FUNÇÃO: hasPermission
 * O que faz: verifica se um cargo tem uma permissão.
 * Parâmetros:
 *   - role (string): cargo (ex.: 'financeiro').
 *   - permission (string): permissão no formato 'modulo:acao' (ex.: 'donations:read').
 * Retorno (boolean): true se tiver; false caso contrário (inclusive para cargo desconhecido).
 * Onde é usada: middleware requirePermission (src/middleware/auth.js).
 */
function hasPermission(role, permission) {
  // "?." evita erro se o cargo não existir (permissionsByRole[role] seria undefined);
  // "|| false" garante que o retorno seja sempre booleano.
  return permissionsByRole[role]?.includes(permission) || false;
}

/*
 * FUNÇÃO: getPermissionsForRole
 * O que faz: devolve a lista de permissões do cargo.
 * Parâmetros: role (string).
 * Retorno (array de strings): uma CÓPIA da lista (o "..." cria um array novo), para que quem
 *   recebe não altere a lista original. Cargo desconhecido → [].
 * Onde é usada: na resposta de /api/v1/me (o frontend usa para montar menus e botões).
 */
function getPermissionsForRole(role) {
  return [...(permissionsByRole[role] || [])];
}

/*
 * FUNÇÃO: getPermissionMatrix
 * O que faz: monta a matriz completa em formato de lista, pronta para virar JSON.
 * Parâmetros: nenhum.
 * Retorno (objeto):
 *   - modules: [{ module, actions }] — todas as ações de cada módulo;
 *   - roles: [{ role, permissions: { modulo: [acoes] } }] — o que cada cargo pode.
 *   Tudo copiado ([...actions]) para não expor os arrays congelados originais.
 * Onde é usada: GET /api/v1/permissions e scripts/gerar-doc-permissoes.js.
 */
function getPermissionMatrix() {
  return {
    modules: Object.entries(moduleActions).map(([module, actions]) => ({ module, actions: [...actions] })),
    roles: Object.entries(roleMatrix).map(([role, modules]) => ({
      role,
      permissions: Object.fromEntries(Object.entries(modules).map(([module, actions]) => [module, [...actions]])),
    })),
  };
}

// Exporta só o necessário (moduleActions, roleMatrix e permissionsByRole ficam internos).
module.exports = { roleLabels, hasPermission, getPermissionsForRole, getPermissionMatrix };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. moduleActions lista as ações de cada módulo; roleMatrix diz o que cada cargo pode.
 *   2. permissionsByRole converte a matriz em listas "modulo:acao" por cargo.
 *   3. hasPermission consulta essas listas a cada requisição protegida.
 *   4. getPermissionsForRole e getPermissionMatrix entregam os dados ao frontend e à documentação.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Controle de acesso baseado em papéis (RBAC: Role-Based Access Control).
 *   - Princípio do menor privilégio (cada cargo só com o necessário).
 *   - Object.freeze, Object.entries, Object.fromEntries, map e flatMap.
 *   - Encadeamento opcional (?.) e cópias de arrays com o operador spread (...).
 *   - Uma única "fonte da verdade" para backend, frontend e documentação.
 * ============================================================================
 */
