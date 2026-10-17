/*
 * ============================================================================
 * ARQUIVO: auth-controller.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CONTROLLER da AUTENTICAÇÃO do painel: login, renovação da sessão, logout,
 *   "esqueci minha senha", redefinição de senha, dados do usuário logado (/me)
 *   e troca da própria senha. Também cuida do COOKIE DE RENOVAÇÃO
 *   (patas_refresh), que mantém a sessão viva sem pedir a senha de novo.
 *
 * COMO A SESSÃO FUNCIONA (resumo):
 *   - Login devolve um token de ACESSO curto (vai no JSON; o painel guarda em memória)
 *     e um token de RENOVAÇÃO (vai num cookie HttpOnly, que o JavaScript não lê).
 *   - Quando o acesso expira, o painel chama /auth/refresh; o navegador envia o cookie
 *     sozinho e recebe um novo token de acesso (e um cookie renovado).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - setRefreshCookie, clearRefreshCookie (internas).
 *   - login, refresh, logout, forgotPassword, resetPassword, me, changePassword.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./auth-service (regras), ../audit/audit-service (auditoria).
 *   - config/env, utils/cookies, utils/http-response.
 *   - Usado por: ./auth-routes.js.
 * ============================================================================
 */

// Regras de autenticação.
const authService = require('./auth-service');
// Registro de auditoria (quem fez o quê).
const auditService = require('../audit/audit-service');
// Configuração.
const { readConfig } = require('../../config/env');
// Ler e montar cookies.
const { parseCookies, serializeCookie } = require('../../utils/cookies');
// Formato padrão de resposta.
const { successResponse } = require('../../utils/http-response');

// Ambiente e tempo de inatividade da sessão.
const { nodeEnv, sessionIdleMinutes } = readConfig();
// Nome do cookie de renovação.
const REFRESH_COOKIE = 'patas_refresh';
// Opções de segurança do cookie:
const refreshCookieOptions = {
  // Só é enviado para as rotas /api/v1/auth (refresh e logout), não para o resto da API.
  path: '/api/v1/auth',
  // Inacessível ao JavaScript da página (protege contra roubo por XSS).
  httpOnly: true,
  // Só por HTTPS em produção (em desenvolvimento, localhost costuma ser HTTP).
  secure: nodeEnv === 'production',
  // Não é enviado em requisições iniciadas por outros sites (protege contra CSRF).
  sameSite: 'Strict',
};

/*
 * FUNÇÃO: setRefreshCookie (interna)
 * O que faz: adiciona o cabeçalho Set-Cookie com o token de renovação.
 * Parâmetros: res (resposta do Express) e refreshToken (string).
 * Detalhe: res.append (e não setHeader) para não apagar outros Set-Cookie já definidos.
 */
function setRefreshCookie(res, refreshToken) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, refreshToken, {
    ...refreshCookieOptions,
    // O cookie vive o mesmo tempo que a inatividade permitida (em segundos).
    maxAgeSeconds: sessionIdleMinutes * 60,
  }));
}

/*
 * FUNÇÃO: clearRefreshCookie (interna)
 * O que faz: apaga o cookie (valor vazio e Max-Age=0).
 */
function clearRefreshCookie(res) {
  res.append('Set-Cookie', serializeCookie(REFRESH_COOKIE, '', { ...refreshCookieOptions, maxAgeSeconds: 0 }));
}

/*
 * FUNÇÃO: login (controller async) — POST /api/v1/auth/login
 * O que faz: confere e-mail/senha, cria a sessão e devolve o token de acesso e os dados do usuário.
 * Retorno: 200 { data: { token, user } } + cookie de renovação.
 */
exports.login = async (req, res) => {
  // Desestruturação com "resto": separa refreshToken e guarda o restante (token, user) em "session".
  // O user-agent (navegador/aparelho) é registrado na sessão.
  const { refreshToken, ...session } = await authService.login(req.body, { userAgent: req.get('user-agent') });
  // O token de renovação vai SÓ no cookie (não aparece no JSON).
  setRefreshCookie(res, refreshToken);
  return res.json(successResponse(session));
};

/*
 * FUNÇÃO: refresh (controller async) — POST /api/v1/auth/refresh
 * O que faz: usa o cookie para emitir um novo token de acesso (e renovar o cookie).
 * Retorno: 200 { data: { token, user } }; em sessão expirada (401) apaga o cookie e repassa o erro.
 */
exports.refresh = async (req, res, next) => {
  try {
    // parseCookies(cabeçalho)[nome] → valor do cookie patas_refresh.
    const { refreshToken, ...session } = await authService.refresh(parseCookies(req.headers.cookie)[REFRESH_COOKIE]);
    setRefreshCookie(res, refreshToken);
    return res.json(successResponse(session));
  } catch (error) {
    // Sessão inválida: apaga o cookie para o navegador não continuar enviando.
    if (error.status === 401) clearRefreshCookie(res);
    return next(error);
  }
};

/*
 * FUNÇÃO: logout (controller async) — POST /api/v1/auth/logout
 * O que faz: revoga a sessão no banco e apaga o cookie.
 * Retorno: 204 (No Content = sucesso sem corpo).
 */
exports.logout = async (req, res) => {
  await authService.logout(parseCookies(req.headers.cookie)[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  // .end() encerra a resposta sem corpo.
  return res.status(204).end();
};

/*
 * FUNÇÃO: forgotPassword (controller async) — POST /api/v1/auth/forgot-password
 * O que faz: pede o envio do link de redefinição.
 * Retorno: 202 (Accepted = "recebido, será processado") com mensagem SEMPRE igual,
 *   exista ou não o e-mail (para não revelar quais e-mails têm conta).
 */
exports.forgotPassword = async (req, res) => {
  await authService.requestPasswordReset(req.body);
  return res.status(202).json(successResponse({
    mensagem: 'Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha.',
  }));
};

/*
 * FUNÇÃO: resetPassword (controller async) — POST /api/v1/auth/reset-password
 * O que faz: define a nova senha usando o token do link (redefinição ou convite).
 */
exports.resetPassword = async (req, res) => {
  await authService.resetPassword(req.body);
  return res.json(successResponse({ mensagem: 'Senha definida. Entre com a nova senha.' }));
};

/*
 * FUNÇÃO: me (controller async) — GET /api/v1/me
 * O que faz: devolve os dados do usuário logado e a lista de permissões dele.
 * Obs.: req.user foi preenchido pelo middleware requireAuth.
 */
exports.me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.sub);
  return res.json(successResponse(user));
};

/*
 * FUNÇÃO: changePassword (controller async) — PATCH /api/v1/me/password
 * O que faz: troca a própria senha (exige a senha atual), encerra as outras sessões
 *   e registra a ação na auditoria.
 * Retorno: 204.
 */
exports.changePassword = async (req, res) => {
  // sessionId: a sessão atual continua ativa; as demais são encerradas.
  await authService.changeOwnPassword(req.user.sub, req.body, { sessionId: req.user.sid });
  // Auditoria: quem (actor), o quê (action), onde (module/entity) e em quem (entityId).
  await auditService.record({
    actor: auditService.auditContext(req),
    action: 'alterar_propria_senha',
    module: 'team',
    entity: 'usuario',
    entityId: req.user.sub,
  });
  return res.status(204).end();
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - login: service valida → token de acesso no JSON + token de renovação no cookie.
 *   - refresh: cookie → novo token de acesso + cookie renovado (ou cookie apagado se expirou).
 *   - logout: revoga a sessão e apaga o cookie.
 *   - forgot/reset: link por e-mail e definição da nova senha.
 *   - me / changePassword: dados do usuário logado e troca de senha com auditoria.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Token de acesso (curto) x token de renovação (cookie HttpOnly).
 *   - Atributos de cookie: HttpOnly, Secure, SameSite, Path, Max-Age.
 *   - Status HTTP 200, 202, 204 e 401.
 *   - Não revelar se uma conta existe (enumeração de usuários).
 *   - Desestruturação com "resto" ({ a, ...resto }).
 * ============================================================================
 */
