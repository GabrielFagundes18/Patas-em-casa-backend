/*
 * ============================================================================
 * ARQUIVO: auth.js (middleware)
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Protege as rotas do painel. Faz duas coisas:
 *     1. AUTENTICAÇÃO (requireAuth): confere QUEM está fazendo a requisição,
 *        lendo o token JWT do cabeçalho "Authorization: Bearer <token>" e
 *        conferindo no banco se o usuário e a sessão ainda são válidos.
 *     2. AUTORIZAÇÃO (requirePermission): confere se essa pessoa PODE fazer a
 *        ação pedida, de acordo com o cargo (matriz em config/permissions.js).
 *   Também cria os tokens de acesso (signToken).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - signToken(payload): cria um JWT de acesso.
 *   - requireAuth(req, res, next): middleware de autenticação.
 *   - requirePermission(permission): fábrica de middleware de autorização.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - jsonwebtoken (biblioteca de JWT).
 *   - ../config/permissions, ../config/env, ../utils/app-error, ../utils/validators.
 *   - ../modules/users/user-repository (busca o usuário) e
 *     ../modules/auth/session-repository (confere a sessão).
 *   - Usado por: praticamente todos os arquivos de rotas do painel e o auth-service (signToken).
 * ============================================================================
 */

// Biblioteca para criar e verificar tokens JWT (JSON Web Token).
const jwt = require('jsonwebtoken');
// Erro da aplicação.
const AppError = require('../utils/app-error');
// Funções da matriz de permissões.
const { getPermissionsForRole, hasPermission } = require('../config/permissions');
// Configuração (para pegar o segredo do JWT).
const { readConfig } = require('../config/env');
// Acesso aos usuários e às sessões no banco.
const userRepository = require('../modules/users/user-repository');
const sessionRepository = require('../modules/auth/session-repository');
// Padrão de UUID (para não consultar o banco com ids malformados).
const { UUID_PATTERN } = require('../utils/validators');

// Segredo usado para assinar/verificar os tokens. Desestruturação: pega só jwtSecret do objeto.
const { jwtSecret } = readConfig();

/*
 * FUNÇÃO: signToken
 * O que faz: cria (assina) um token JWT de acesso.
 * Parâmetros:
 *   - payload (objeto): dados gravados no token, ex.: { sub: idDoUsuario, sid: idDaSessao }.
 * Retorno (string): o token (três partes separadas por ponto: cabeçalho.dados.assinatura).
 * Detalhe: o token expira em JWT_EXPIRES_IN (padrão 15 minutos). Depois disso, o painel
 *   usa o cookie de renovação para obter outro.
 */
function signToken(payload) {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

/*
 * FUNÇÃO: requireAuth (middleware async)
 * O que faz: exige um token válido e um usuário ativo com sessão ativa.
 * Parâmetros: req, res, next (padrão do Express).
 * Resultado:
 *   - sucesso: preenche req.user = { sub, email, nome, role, sid } e chama next();
 *   - falha: chama next(AppError 401) → resposta "não autenticado".
 */
async function requireAuth(req, res, next) {
  // Cabeçalho Authorization (ou texto vazio, se não veio).
  const authHeader = req.headers.authorization || '';
  // Formato esperado: "Bearer <token>". slice(7) remove os 7 caracteres de "Bearer ".
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Sem token: não autenticado.
  if (!token) {
    return next(new AppError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou não autenticada.'));
  }

  // jwt.verify confere a assinatura e a validade; se falhar, lança erro.
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (error) {
    return next(new AppError(401, 'TOKEN_INVALIDO', 'Token inválido ou expirado.'));
  }

  try {
    // Cargo e situação vêm do banco a cada requisição, e não do token: troca de cargo
    // e desativação valem imediatamente, sem esperar o token expirar.
    // payload.sub = id do usuário. Só consulta o banco se for um UUID válido.
    const user = UUID_PATTERN.test(String(payload.sub))
      ? await userRepository.findById(payload.sub)
      : null;

    // Usuário inexistente, desativado ou com cargo sem nenhuma permissão: recusa.
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      return next(new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.'));
    }

    // Sessão revogada (logout, troca de senha, desativação) derruba o token na hora, sem esperar expirar.
    // payload.sid = id da sessão (tokens antigos podem não ter; nesse caso esta checagem é pulada).
    if (payload.sid !== undefined) {
      const session = UUID_PATTERN.test(String(payload.sid)) ? await sessionRepository.findActive(payload.sid) : null;
      // A sessão precisa existir, estar ativa e pertencer ao mesmo usuário do token.
      if (!session || session.usuario_id !== user.id) {
        return next(new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.'));
      }
    }

    // Tudo certo: guarda os dados do usuário na requisição para os próximos middlewares/controllers.
    req.user = { sub: user.id, email: user.email, nome: user.nome, role: user.cargo, sid: payload.sid };
    return next();
  } catch (error) {
    // Erro inesperado (ex.: banco fora do ar): vai para o error-handler (500).
    return next(error);
  }
}

/*
 * FUNÇÃO: requirePermission
 * O que faz: cria um middleware que exige uma permissão específica.
 * Parâmetros:
 *   - permission (string): no formato 'modulo:acao' (ex.: 'animals:delete').
 * Retorno (função middleware): chama next() se permitido; senão next(AppError 401/403).
 * Uso: router.delete('/:id', requireAuth, requirePermission('animals:delete'), ...).
 *   Precisa vir DEPOIS de requireAuth (que preenche req.user).
 */
function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    // Sem usuário autenticado: 401.
    if (!req.user) {
      return next(new AppError(401, 'NAO_AUTENTICADO', 'Sessão expirada ou não autenticada.'));
    }

    // Autenticado mas sem permissão: 403 (proibido).
    if (!hasPermission(req.user.role, permission)) {
      return next(new AppError(403, 'SEM_PERMISSAO', 'Você não tem permissão para esta ação.'));
    }

    // Permitido: segue para o próximo passo.
    return next();
  };
}

// Exporta as três funções.
module.exports = { signToken, requireAuth, requirePermission };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. O painel envia "Authorization: Bearer <token>".
 *   2. requireAuth verifica a assinatura e a validade do token, busca o usuário
 *      no banco (ativo, com cargo válido) e confere a sessão (não revogada).
 *   3. Preenche req.user; requirePermission confere a permissão do cargo.
 *   4. Qualquer falha vira 401 (não autenticado) ou 403 (sem permissão).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Autenticação x autorização (quem é x o que pode fazer).
 *   - JWT: assinatura, expiração, "sub" (subject) e claims personalizados.
 *   - Revogação de sessões e por que consultar o banco a cada requisição.
 *   - Status 401 x 403.
 *   - Middlewares "fábrica" (função que devolve middleware) e req.user.
 * ============================================================================
 */
