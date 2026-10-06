// Matriz única de permissões (módulo × ação). Toda rota protegida usa requirePermission('modulo:acao')
// e /api/v1/me devolve a lista achatada para o frontend montar menu, rotas e botões.
// Ações: read (ver), create (criar), update (editar), delete (excluir), approve (aprovar/decidir),
// export (exportar), reveal (revelar dado pessoal mascarado).
const moduleActions = Object.freeze({
  dashboard: ['read'],
  animals: ['read', 'create', 'update', 'delete', 'export'],
  adoptions: ['read', 'update', 'approve'],
  adopters: ['read', 'update', 'reveal', 'export'],
  lgpd: ['approve'],
  donations: ['read', 'create', 'update', 'export'],
  volunteers: ['read', 'create', 'update', 'delete'],
  stories: ['read', 'create', 'update', 'delete'],
  team: ['read', 'create', 'update'],
});

// Cargos do banco: administrador (Super Admin), gestor_ong (Gestor da ONG), gestor_animais
// (Veterinário/Cuidador), financeiro (Atendimento e Doações) e voluntariado (Voluntário).
const roleMatrix = Object.freeze({
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
  gestor_animais: {
    dashboard: ['read'],
    animals: ['read', 'create', 'update', 'export'],
    adoptions: ['read', 'update', 'approve'],
    adopters: ['read', 'reveal'],
    volunteers: ['read'],
    stories: ['read', 'create', 'update'],
  },
  financeiro: {
    dashboard: ['read'],
    adoptions: ['read', 'update'],
    adopters: ['read', 'update', 'reveal', 'export'],
    donations: ['read', 'create', 'update', 'export'],
  },
  voluntariado: {
    dashboard: ['read'],
    animals: ['read'],
    volunteers: ['read', 'create', 'update'],
    stories: ['read'],
  },
});

const permissionsByRole = Object.freeze(Object.fromEntries(
  Object.entries(roleMatrix).map(([role, modules]) => [
    role,
    Object.entries(modules).flatMap(([module, actions]) => actions.map((action) => `${module}:${action}`)),
  ])
));

function hasPermission(role, permission) {
  return permissionsByRole[role]?.includes(permission) || false;
}

function getPermissionsForRole(role) {
  return [...(permissionsByRole[role] || [])];
}

function getPermissionMatrix() {
  return {
    modules: Object.entries(moduleActions).map(([module, actions]) => ({ module, actions: [...actions] })),
    roles: Object.entries(roleMatrix).map(([role, modules]) => ({
      role,
      permissions: Object.fromEntries(Object.entries(modules).map(([module, actions]) => [module, [...actions]])),
    })),
  };
}

module.exports = { hasPermission, getPermissionsForRole, getPermissionMatrix };
