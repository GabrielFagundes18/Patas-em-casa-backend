const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const app = require('../src/app');

// Lê as rotas reais registradas no Express (inclusive as de routers montados em subcaminhos).
function listRoutes() {
  const routes = [];

  function mountPath(layer) {
    if (layer.regexp.fast_slash) return '';
    return layer.regexp.source
      .replace('^', '')
      .replace('\\/?(?=\\/|$)', '')
      .replace(/\\\//g, '/');
  }

  for (const layer of app._router.stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} ${layer.route.path}`);
    } else if (layer.name === 'router') {
      const base = mountPath(layer);
      for (const inner of layer.handle.stack) {
        if (!inner.route) continue;
        const routePath = `${base}${inner.route.path === '/' ? '' : inner.route.path}` || '/';
        for (const method of Object.keys(inner.route.methods)) routes.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  return routes.map((route) => route.replace(/:(\w+)/g, '{$1}'));
}

// Lê pares "MÉTODO caminho" do docs/openapi.yaml sem depender de biblioteca YAML.
function listDocumented() {
  const lines = fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8').split('\n');
  const documented = [];
  let currentPath = null;
  let inPaths = false;

  for (const line of lines) {
    if (line === 'paths:') { inPaths = true; continue; }
    if (inPaths && /^\S/.test(line)) break;
    const pathMatch = line.match(/^ {2}(\/\S*):$/);
    if (pathMatch) { currentPath = pathMatch[1]; continue; }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):$/);
    if (methodMatch && currentPath) documented.push(`${methodMatch[1].toUpperCase()} ${currentPath}`);
  }

  return documented;
}

test('every registered route is documented in docs/openapi.yaml and vice versa', () => {
  const routes = new Set(listRoutes());
  const documented = new Set(listDocumented());

  assert.ok(routes.size > 40, 'a leitura das rotas do Express deveria encontrar todas as rotas');
  assert.deepEqual([...routes].filter((route) => !documented.has(route)).sort(), [], 'rotas sem documentação');
  assert.deepEqual([...documented].filter((route) => !routes.has(route)).sort(), [], 'documentação sem rota');
});
