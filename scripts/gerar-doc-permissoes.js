/*
 * ============================================================================
 * ARQUIVO: gerar-doc-permissoes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SCRIPT (programa de linha de comando) que GERA a documentação
 *   docs/permissoes.md: uma tabela em Markdown dizendo, para cada módulo e
 *   ação, quais cargos têm permissão. A tabela é montada a partir da matriz
 *   em src/config/permissions.js, então documentação e código nunca divergem.
 *   Rodar com: npm run docs:permissoes
 *
 * PRINCIPAIS ITENS:
 *   - MODULE_LABELS / ACTION_LABELS: nomes amigáveis de módulos e ações.
 *   - buildDocument(): monta o texto do arquivo (exportada).
 *   - target: caminho de docs/permissoes.md (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:fs, node:path e ../src/config/permissions.
 *   - Testado em tests/unit/shared.test.js, que confere se docs/permissoes.md está
 *     igual ao que buildDocument() gera (se a matriz mudar, é preciso rodar o script).
 * ============================================================================
 */

// Gera docs/permissoes.md a partir da matriz única em src/config/permissions.js.
// Uso: npm run docs:permissoes
// Leitura/escrita de arquivos.
const fs = require('node:fs');
// Montagem de caminhos.
const path = require('node:path');
// Matriz de permissões e nomes dos cargos.
const { getPermissionMatrix, roleLabels } = require('../src/config/permissions');

// Nome de exibição de cada módulo.
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

// Nome de exibição de cada ação.
const ACTION_LABELS = {
  read: 'ver',
  create: 'criar',
  update: 'editar',
  delete: 'excluir',
  approve: 'aprovar',
  export: 'exportar',
  reveal: 'revelar dados pessoais',
};

/*
 * FUNÇÃO: buildDocument (exportada)
 * O que faz: monta o conteúdo Markdown do arquivo.
 * Parâmetros: nenhum.
 * Retorno (string): título, explicação e a tabela (uma linha por módulo + ação, uma coluna por cargo).
 * Detalhe do Markdown: tabelas usam "|" entre colunas; a 2ª linha (separador) define as colunas;
 *   ":---:" centraliza a coluna. As crases (escapadas com \` dentro da template string) formatam código.
 */
function buildDocument() {
  // Módulos (com ações) e cargos (com permissões).
  const { modules, roles } = getPermissionMatrix();
  // Cabeçalho: "| Módulo | Ação | Cargo 1 | Cargo 2 | ... |".
  const header = `| Módulo | Ação | ${roles.map((role) => roleLabels[role.role]).join(' | ')} |`;
  // Linha separadora com uma coluna centralizada por cargo.
  const separator = `| --- | --- | ${roles.map(() => ':---:').join(' | ')} |`;
  // Uma linha por par (módulo, ação); cada célula diz "sim" ou "—" para o cargo.
  // flatMap junta as listas de linhas de todos os módulos numa lista só.
  const rows = modules.flatMap(({ module, actions }) => actions.map((action) => {
    const cells = roles.map((role) => (role.permissions[module]?.includes(action) ? 'sim' : '—'));
    return `| ${MODULE_LABELS[module]} (\`${module}\`) | ${ACTION_LABELS[action]} (\`${action}\`) | ${cells.join(' | ')} |`;
  }));

  // Junta todas as linhas do documento com quebras de linha.
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

// Caminho do arquivo gerado (__dirname = pasta deste script).
const target = path.join(__dirname, '..', 'docs', 'permissoes.md');

// require.main === module → este arquivo foi executado diretamente (node scripts/gerar-doc-permissoes.js),
// e não importado por outro arquivo (como o teste). Só então grava o arquivo.
if (require.main === module) {
  fs.writeFileSync(target, buildDocument());
  // path.relative mostra o caminho de forma curta, a partir da pasta atual.
  console.info(`Matriz gravada em ${path.relative(process.cwd(), target)}.`);
}

// Exporta para o teste.
module.exports = { buildDocument, target };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   npm run docs:permissoes → lê a matriz → buildDocument monta o Markdown →
 *   grava docs/permissoes.md. O teste compara o arquivo com buildDocument().
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Documentação gerada a partir do código ("docs as code").
 *   - Tabelas em Markdown.
 *   - require.main === module (arquivo executado x importado).
 *   - fs.writeFileSync e path.join/relative.
 * ============================================================================
 */
