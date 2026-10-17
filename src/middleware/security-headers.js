/*
 * ============================================================================
 * ARQUIVO: security-headers.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Adiciona CABEÇALHOS HTTP DE SEGURANÇA a todas as respostas. Eles instruem o
 *   navegador a se proteger contra vários ataques (página dentro de iframe,
 *   adivinhação de tipo de arquivo, vazamento de endereço, cache de dados
 *   pessoais...). Faz um trabalho parecido com o da biblioteca "helmet", mas
 *   escrito à mão e só com o necessário.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - securityHeaders(req, res, next): o middleware (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Registrado primeiro em src/app.js.
 *   - Testado em tests/unit/http-foundation.test.js e http-permissions.test.js.
 * ============================================================================
 */

/*
 * FUNÇÃO: securityHeaders (middleware)
 * O que faz: define os cabeçalhos de segurança na resposta.
 * Parâmetros: req, res, next.
 * Retorno: o resultado de next().
 */
function securityHeaders(req, res, next) {
  // Não "adivinhar" o tipo do arquivo: usar exatamente o Content-Type informado.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Proíbe exibir as respostas dentro de <iframe> (protege contra "clickjacking").
  res.setHeader('X-Frame-Options', 'DENY');
  // Não enviar o endereço de origem (Referer) para outros sites.
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Política de conteúdo bem restrita: a API só devolve JSON, então nada de scripts, estilos ou iframes.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  // Só sites do mesmo "site" podem carregar estes recursos (as fotos em /uploads trocam para cross-origin).
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  // Respostas da API podem conter dados pessoais: nada de cache em navegador ou proxy.
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  // Em HTTPS (req.secure), pede ao navegador para usar sempre HTTPS neste domínio por 1 ano (HSTS).
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Segue para o próximo middleware.
  return next();
}

// Exporta o middleware.
module.exports = securityHeaders;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Em toda requisição, define cabeçalhos fixos de segurança; nas rotas /api/
 *   proíbe cache; em conexões HTTPS ativa o HSTS. Depois chama next().
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Cabeçalhos de segurança: X-Content-Type-Options, X-Frame-Options,
 *     Referrer-Policy, Content-Security-Policy, CORP, HSTS e Cache-Control.
 *   - Clickjacking, MIME sniffing e cache de dados sensíveis.
 *   - Biblioteca helmet (alternativa pronta).
 * ============================================================================
 */
