// Gera docs/permissoes.md a partir da matriz única em src/config/permissions.js.
// Uso: npm run docs:permissoes
const fs = require('node:fs');
const path = require('node:path');
const { getPermissionMatrix, roleLabels } = require('../src/config/permissions');

const MODULE_LABELS = {
  dashboard: 'Visão geral',
  animals: 'Animais',
  adoptions: 'Pedidos de adoção',
  adopters: 'Adotantes',
  lgpd: 'LGPD (titular)',
  donations: 'Doações',
  volunteers: 'Voluntários',
  stories: 'Histórias',
  team: 'Equipe e permissões',
};

const ACTION_LABELS = {
  read: 'ver',
  create: 'criar',
  update: 'editar',
  delete: 'excluir',
  approve: 'aprovar',
  export: 'exportar',
  reveal: 'revelar dados pessoais',
};

function buildDocument() {
  const { modules, roles } = getPermissionMatrix();
  const header = `| Módulo | Ação | ${roles.map((role) => roleLabels[role.role]).join(' | ')} |`;
  const separator = `| --- | --- | ${roles.map(() => ':---:').join(' | ')} |`;
  const rows = modules.flatMap(({ module, actions }) => actions.map((action) => {
    const cells = roles.map((role) => (role.permissions[module]?.includes(action) ? 'sim' : '—'));
    return `| ${MODULE_LABELS[module]} (\`${module}\`) | ${ACTION_LABELS[action]} (\`${action}\`) | ${cells.join(' | ')} |`;
  }));

  return [
    '# Matriz de permissões',
    '',
    'Gerado por `npm run docs:permissoes` a partir de `src/config/permissions.js` (fonte única).',
    'A API aplica a matriz em todas as rotas protegidas; `GET /api/v1/me` devolve as permissões',
    'do usuário logado e `GET /api/v1/permissions` devolve a matriz completa (somente administrador).',
    '',
    header,
    separator,
    ...rows,
    '',
  ].join('\n');
}

const target = path.join(__dirname, '..', 'docs', 'permissoes.md');

if (require.main === module) {
  fs.writeFileSync(target, buildDocument());
  console.info(`Matriz gravada em ${path.relative(process.cwd(), target)}.`);
}

module.exports = { buildDocument, target };
