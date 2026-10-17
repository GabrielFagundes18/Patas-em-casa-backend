/*
 * ============================================================================
 * ARQUIVO: openapi-coverage.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTE que garante que a DOCUMENTAÇÃO DA API (docs/openapi.yaml) está
 *   completa: toda rota registrada no Express precisa estar documentada, e toda
 *   rota documentada precisa existir no código.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - listRoutes(): lê as rotas reais do Express ("MÉTODO /caminho/{param}").
 *   - listDocumented(): lê os pares "MÉTODO caminho" do openapi.yaml (sem biblioteca YAML).
 *   - 1 teste.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/app.js e docs/openapi.yaml (lido linha a linha — por isso o openapi.yaml não
 *     recebeu comentários: mudar a estrutura dele poderia confundir esta leitura).
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Arquivos e caminhos.
const fs = require('node:fs');
const path = require('node:path');
// Executor de testes.
const test = require('node:test');
// A aplicação (para ler as rotas registradas).
const app = require('../../src/app');

/*
 * FUNÇÃO: listRoutes
 * O que faz: percorre a "pilha" interna do Express (app._router.stack) e monta a lista de rotas.
 *   - Camadas com "route" são rotas diretas do app.
 *   - Camadas "router" são roteadores montados num prefixo; o prefixo é reconstruído a partir da
 *     expressão regular que o Express gera para ele.
 * Retorno (array): ex.: ['GET /api/v1/animals/{id}', ...] (":id" vira "{id}", como no OpenAPI).
 */
// Lê as rotas reais registradas no Express (inclusive as de routers montados em subcaminhos).
function listRoutes() {
  const routes = [];

  // Converte a regex do prefixo de volta em texto (ex.: "^\/api\/v1\/animals\/?(?=\/|$)" → "/api/v1/animals").
  function mountPath(layer) {
    // fast_slash = montado na raiz "/".
    if (layer.regexp.fast_slash) return '';
    return layer.regexp.source
      .replace('^', '')
      .replace('\\/?(?=\\/|$)', '')
      .replace(/\\\//g, '/');
  }

  for (const layer of app._router.stack) {
    if (layer.route) {
      // Rota direta: um item por método (get, post...).
      for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} ${layer.route.path}`);
    } else if (layer.name === 'router') {
      // Roteador: junta o prefixo com o caminho de cada rota interna.
      const base = mountPath(layer);
      for (const inner of layer.handle.stack) {
        // Ignora middlewares (router.use) que não são rotas.
        if (!inner.route) continue;
        const routePath = `${base}${inner.route.path === '/' ? '' : inner.route.path}` || '/';
        for (const method of Object.keys(inner.route.methods)) routes.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  // ":nome" → "{nome}" (formato do OpenAPI).
  return routes.map((route) => route.replace(/:(\w+)/g, '{$1}'));
}

/*
 * FUNÇÃO: listDocumented
 * O que faz: lê o openapi.yaml linha a linha:
 *   - acha a seção "paths:";
 *   - caminhos têm 2 espaços de recuo ("  /api/v1/...:");
 *   - métodos têm 4 espaços ("    get:").
 * Retorno (array): ex.: ['GET /api/v1/animals/{id}', ...].
 */
// Lê pares "MÉTODO caminho" do docs/openapi.yaml sem depender de biblioteca YAML.
function listDocumented() {
  const lines = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'openapi.yaml'), 'utf8').split('\n');
  const documented = [];
  let currentPath = null;
  let inPaths = false;

  for (const line of lines) {
    if (line === 'paths:') { inPaths = true; continue; }
    // Uma linha sem recuo depois de "paths:" = começou outra seção: para.
    if (inPaths && /^\S/.test(line)) break;
    const pathMatch = line.match(/^ {2}(\/\S*):$/);
    if (pathMatch) { currentPath = pathMatch[1]; continue; }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):$/);
    if (methodMatch && currentPath) documented.push(`${methodMatch[1].toUpperCase()} ${currentPath}`);
  }

  return documented;
}

// Teste: as duas listas precisam ser iguais (comparadas como conjuntos).
test('every registered route is documented in docs/openapi.yaml and vice versa', () => {
  const routes = new Set(listRoutes());
  const documented = new Set(listDocumented());

  // Sanidade: se a leitura do Express quebrar (ex.: mudança de versão), o teste avisa.
  assert.ok(routes.size > 40, 'a leitura das rotas do Express deveria encontrar todas as rotas');
  // Rotas que existem mas não estão documentadas → precisa ser lista vazia.
  assert.deepEqual([...routes].filter((route) => !documented.has(route)).sort(), [], 'rotas sem documentação');
  // Documentação de rotas que não existem → precisa ser lista vazia.
  assert.deepEqual([...documented].filter((route) => !routes.has(route)).sort(), [], 'documentação sem rota');
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Lê as rotas do Express e do openapi.yaml, converte ambas para o mesmo formato
 *   e confere a diferença nos dois sentidos.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - OpenAPI (especificação de documentação de APIs REST).
 *   - Testes que mantêm documentação e código sincronizados.
 *   - Set e diferença entre conjuntos.
 *   - Expressões regulares com âncoras (^, $) e quantificadores ({2}, {4}).
 *   - Uso de propriedades internas (app._router) — práticas, mas podem mudar entre versões.
 * ============================================================================
 */
