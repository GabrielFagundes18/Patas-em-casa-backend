/*
 * ============================================================================
 * ARQUIVO: cookies.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Lê e escreve COOKIES sem precisar de biblioteca externa. Cookies são
 *   pequenos textos que o navegador guarda e reenvia ao servidor em cada
 *   requisição. O painel usa um cookie (patas_refresh) para manter a sessão.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - parseCookies(header): texto do cabeçalho "Cookie" → objeto { nome: valor }.
 *   - serializeCookie(name, value, options): monta o texto do cabeçalho "Set-Cookie".
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: modules/auth (auth-controller.js, para criar/apagar o cookie de sessão).
 * ============================================================================
 */

/*
 * FUNÇÃO: parseCookies
 * O que faz: transforma o cabeçalho "Cookie" em objeto.
 * Parâmetros: header (string, opcional) — ex.: "a=1; patas_refresh=abc%20d".
 * Retorno (objeto): ex.: { a: '1', patas_refresh: 'abc d' }.
 */
function parseCookies(header = '') {
  // Object.fromEntries transforma a lista de pares [nome, valor] em objeto.
  return Object.fromEntries(
    header
      // Cada cookie é separado por ";".
      .split(';')
      // Tira os espaços das pontas.
      .map((part) => part.trim())
      // Remove pedaços vazios.
      .filter(Boolean)
      // Separa nome e valor no PRIMEIRO "=" (o valor pode conter outros "=").
      .map((part) => {
        const index = part.indexOf('=');
        // Sem "=": cookie sem valor.
        if (index === -1) return [part, ''];
        // decodeURIComponent desfaz a codificação (ex.: "%20" vira espaço).
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

/*
 * FUNÇÃO: serializeCookie
 * O que faz: monta o valor do cabeçalho "Set-Cookie".
 * Parâmetros:
 *   - name (string) e value (string): nome e valor do cookie.
 *   - options (objeto, opcional):
 *       maxAgeSeconds (number): validade em segundos (0 = apagar o cookie);
 *       path (string): caminho em que o navegador envia o cookie;
 *       httpOnly (boolean): JavaScript da página NÃO consegue ler o cookie (protege contra roubo por XSS);
 *       secure (boolean): só é enviado em HTTPS;
 *       sameSite (string): 'Strict' | 'Lax' | 'None' — se vai junto em requisições vindas de outros sites.
 * Retorno (string): ex.: "patas_refresh=abc; Max-Age=3600; Path=/api/v1/auth; HttpOnly; SameSite=Strict".
 */
function serializeCookie(name, value, options = {}) {
  // Primeira parte: nome=valor (encodeURIComponent codifica caracteres especiais).
  const parts = [`${name}=${encodeURIComponent(value)}`];
  // Cada opção informada vira um atributo. "!== undefined" permite Max-Age=0.
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  // Junta tudo com "; ".
  return parts.join('; ');
}

// Exporta as duas funções.
module.exports = { parseCookies, serializeCookie };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Na ida (resposta): serializeCookie monta "Set-Cookie" com os atributos de segurança.
 *   - Na volta (requisição): parseCookies lê o cabeçalho "Cookie" e devolve um objeto.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Cabeçalhos HTTP Cookie e Set-Cookie.
 *   - Atributos de segurança: HttpOnly, Secure, SameSite, Path e Max-Age.
 *   - encodeURIComponent / decodeURIComponent.
 *   - Encadeamento de métodos de array (split → map → filter → map).
 * ============================================================================
 */
