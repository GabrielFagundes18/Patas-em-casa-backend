/*
 * ============================================================================
 * ARQUIVO: auth-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE com as REGRAS DE AUTENTICAÇÃO do painel:
 *     - login: confere e-mail e senha, bloqueia após muitas falhas, cria a sessão
 *       no banco e emite os tokens;
 *     - refresh: renova o token de acesso usando o token de renovação (cookie);
 *     - logout: revoga a sessão;
 *     - getCurrentUser: dados do usuário logado com as permissões;
 *     - changeOwnPassword: troca a própria senha (encerra as outras sessões);
 *     - requestPasswordReset / resetPassword: fluxo de "esqueci minha senha" e convite.
 *
 * PRINCIPAIS ITENS:
 *   - DUMMY_PASSWORD_HASH, BCRYPT_ROUNDS.
 *   - serializeUser(user): formato público do usuário (exportada).
 *   - expiredSession(), weakPassword(problems, field): criam erros padronizados.
 *   - createAuthService(deps): fábrica do service (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - bcryptjs (hash de senhas), jsonwebtoken (tokens), node:crypto.
 *   - config/permissions, config/env, middleware/auth (signToken), utils/password-policy,
 *     db/transaction, utils/logger, utils/app-error.
 *   - users/user-repository, ./session-repository, ./access-link-service, ./login-throttle.
 *   - Usado por: ./auth-controller.js. Testado em tests/unit/auth-service.test.js e
 *     sessions-and-reset.test.js.
 * ============================================================================
 */

// Bytes aleatórios (para o hash "falso").
const { randomBytes } = require('node:crypto');
// bcrypt: algoritmo de hash de senhas (lento de propósito, para dificultar ataques).
const bcrypt = require('bcryptjs');
// JWT: criação e verificação de tokens.
const jwt = require('jsonwebtoken');
// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Permissões por cargo.
const { getPermissionsForRole } = require('../../config/permissions');
// Configuração.
const { readConfig } = require('../../config/env');
// Cria o token de acesso.
const { signToken } = require('../../middleware/auth');
// Política de senha.
const { getPasswordProblems } = require('../../utils/password-policy');
// Transações.
const withTransaction = require('../../db/transaction');
// Usuários e sessões no banco.
const userRepository = require('../users/user-repository');
const sessionRepository = require('./session-repository');
// Logs.
const logger = require('../../utils/logger');
// Links de acesso por e-mail.
const accessLinkService = require('./access-link-service');
// Bloqueio de login após falhas.
const loginThrottle = require('./login-throttle');

// Hash de uma senha aleatória, criado uma vez ao carregar o arquivo. Quando o e-mail NÃO existe,
// comparamos a senha com este hash mesmo assim: a resposta demora o mesmo tempo que com um e-mail
// existente, e um atacante não consegue descobrir pelo tempo quais e-mails têm conta.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
// "Custo" do bcrypt (2^12 rodadas): quanto maior, mais lento e mais seguro.
const BCRYPT_ROUNDS = 12;
// Segredo do token de renovação e tempos de sessão.
const { refreshTokenSecret, sessionIdleMinutes, sessionMaxHours } = readConfig();

/*
 * FUNÇÃO: serializeUser (exportada)
 * O que faz: monta o objeto do usuário que pode ir para o frontend (sem senha!).
 * Parâmetros: user (linha do banco).
 * Retorno: { id, nome, email, cargo, permissions }.
 */
function serializeUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    cargo: user.cargo,
    // Lista "modulo:acao" que o painel usa para montar menus e botões.
    permissions: getPermissionsForRole(user.cargo),
  };
}

/*
 * FUNÇÃO: expiredSession
 * O que faz: cria o erro 401 de sessão expirada (reutilizado em vários pontos).
 */
function expiredSession() {
  return new AppError(401, 'SESSAO_EXPIRADA', 'Sua sessão expirou. Entre novamente.');
}

/*
 * FUNÇÃO: weakPassword
 * O que faz: cria o erro 422 de senha fraca, com um detalhe por problema.
 * Parâmetros: problems (array de mensagens) e field (nome do campo, ex.: 'nova_senha').
 */
function weakPassword(problems, field) {
  return new AppError(422, 'SENHA_FRACA', 'A nova senha não atende à política de senha.', problems.map((message) => ({ field, message })));
}

/*
 * FUNÇÃO: createAuthService (fábrica)
 * O que faz: cria o service com as dependências informadas (ou as reais, por padrão).
 * Parâmetros (objeto, opcionais): repository, comparePassword, hashPassword, throttle,
 *   sessions, accessLinks, transaction, now (relógio), log.
 * Retorno: { login, refresh, logout, getCurrentUser, changeOwnPassword, requestPasswordReset, resetPassword }.
 */
function createAuthService({
  repository = userRepository,
  comparePassword = bcrypt.compare,
  hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  throttle = loginThrottle,
  sessions = sessionRepository,
  accessLinks = accessLinkService,
  transaction = withTransaction,
  now = () => Date.now(),
  log = logger,
} = {}) {
  /*
   * FUNÇÃO INTERNA: issueAccessToken
   * O que faz: cria o token de ACESSO (curto) com id do usuário, e-mail, cargo, nome e id da sessão.
   */
  // Os dois tokens carregam o id da sessão (sid): revogar a sessão no banco derruba ambos.
  function issueAccessToken(user, sessionId) {
    return signToken({ sub: user.id, email: user.email, role: user.cargo, nome: user.nome, sid: sessionId });
  }

  /*
   * FUNÇÃO INTERNA: issueRefreshToken
   * O que faz: cria o token de RENOVAÇÃO (vai no cookie).
   * Parâmetros: user, authTime (segundos desde 1970 do momento do login) e sessionId.
   * Detalhe: typ: 'refresh' diferencia este token do de acesso; assinado com outro segredo.
   */
  // Token de renovação: vale por SESSION_IDLE_MINUTES a partir do último uso (inatividade)
  // e nunca além de SESSION_MAX_HOURS desde o login (auth_time).
  function issueRefreshToken(user, authTime, sessionId) {
    return jwt.sign({ sub: user.id, typ: 'refresh', auth_time: authTime, sid: sessionId }, refreshTokenSecret, {
      expiresIn: sessionIdleMinutes * 60,
    });
  }

  /*
   * FUNÇÃO INTERNA: login (async)
   * Parâmetros:
   *   - credentials ({ email, password }).
   *   - opções ({ userAgent }): navegador/aparelho, gravado na sessão.
   * Retorno: { token, refreshToken, user }. Lança 422 (dados faltando), 429 (bloqueado) ou 401 (inválido).
   */
  async function login(credentials = {}, { userAgent } = {}) {
    // E-mail normalizado: sem espaços nas pontas e em minúsculas.
    const email = typeof credentials.email === 'string'
      ? credentials.email.trim().toLowerCase()
      : '';
    const password = credentials.password;

    // Faltou e-mail ou senha: 422 com os detalhes de cada campo que faltou.
    // "...(condição ? [item] : [])" inclui o item só quando a condição é verdadeira.
    if (!email || typeof password !== 'string' || password.length === 0) {
      throw new AppError(422, 'VALIDACAO_INVALIDA', 'Informe e-mail e senha.', [
        ...(!email ? [{ field: 'email', message: 'Informe um e-mail válido.' }] : []),
        ...(typeof password !== 'string' || password.length === 0
          ? [{ field: 'password', message: 'Informe a senha.' }]
          : []),
      ]);
    }

    // Conta bloqueada por excesso de falhas? Informa em quantos minutos tentar de novo.
    const lock = throttle.check(email);
    if (lock.locked) {
      const minutes = Math.ceil(lock.retryAfterMs / 60000);
      throw new AppError(429, 'LOGIN_BLOQUEADO', `Muitas tentativas sem sucesso. Tente novamente em ${minutes} minuto(s).`);
    }

    // Busca o usuário e compara a senha (com o hash falso se o usuário não existir — veja DUMMY_PASSWORD_HASH).
    const user = await repository.findByEmail(email);
    const passwordHash = user?.senha_hash || DUMMY_PASSWORD_HASH;
    const passwordMatches = await comparePassword(password, passwordHash);

    // Qualquer problema gera a MESMA mensagem genérica (não revela se o erro foi no e-mail ou na senha).
    if (!user || !user.ativo || !passwordMatches || getPermissionsForRole(user.cargo).length === 0) {
      throttle.registerFailure(email);
      throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
    }

    // Sucesso: zera o contador de falhas.
    throttle.registerSuccess(email);
    // Momento do login em segundos (formato usado nos JWT).
    const authTime = Math.floor(now() / 1000);
    // Cria a sessão no banco; ela expira no máximo SESSION_MAX_HOURS depois do login.
    const sessionId = await sessions.create({
      usuarioId: user.id,
      // "?." evita erro se não houver user-agent; slice limita a 500 caracteres.
      agenteUsuario: userAgent?.slice(0, 500),
      expiraEm: new Date((authTime + sessionMaxHours * 3600) * 1000),
    });

    return {
      token: issueAccessToken(user, sessionId),
      refreshToken: issueRefreshToken(user, authTime, sessionId),
      user: serializeUser(user),
    };
  }

  /*
   * FUNÇÃO INTERNA: refresh (async)
   * O que faz: valida o token de renovação e emite novos tokens.
   * Parâmetros: refreshToken (string do cookie, pode ser undefined).
   * Retorno: { token, refreshToken, user }. Lança 401 se algo estiver errado.
   */
  async function refresh(refreshToken) {
    // Assinatura e validade do token.
    let payload;
    try {
      payload = jwt.verify(refreshToken || '', refreshTokenSecret);
    } catch (error) {
      throw expiredSession();
    }

    // Tokens sem sid (emitidos antes das sessões no banco) exigem novo login.
    if (payload.typ !== 'refresh' || !Number.isInteger(payload.auth_time) || typeof payload.sid !== 'string') {
      throw expiredSession();
    }
    // Passou do tempo máximo desde o login? Precisa entrar de novo.
    if (Math.floor(now() / 1000) - payload.auth_time > sessionMaxHours * 3600) throw expiredSession();

    // A sessão precisa estar ativa no banco e ser do mesmo usuário.
    const session = await sessions.findActive(payload.sid);
    if (!session || session.usuario_id !== payload.sub) throw expiredSession();

    // O usuário precisa continuar ativo e com um cargo válido.
    const user = await repository.findById(payload.sub);
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    // Registra o último uso da sessão e emite tokens novos (mantendo o auth_time original).
    await sessions.touch(session.id);
    return {
      token: issueAccessToken(user, session.id),
      refreshToken: issueRefreshToken(user, payload.auth_time, session.id),
      user: serializeUser(user),
    };
  }

  /*
   * FUNÇÃO INTERNA: logout (async)
   * O que faz: revoga a sessão indicada no cookie. Nunca lança erro.
   */
  // Encerra a sessão do cookie no banco. Cookie inválido ou expirado não é erro: o logout sempre conclui.
  async function logout(refreshToken) {
    let payload;
    try {
      // ignoreExpiration: mesmo um token vencido serve para descobrir qual sessão encerrar.
      payload = jwt.verify(refreshToken || '', refreshTokenSecret, { ignoreExpiration: true });
    } catch (error) {
      // Token inválido (assinatura errada, lixo): nada a fazer.
      return;
    }
    if (payload.typ === 'refresh' && typeof payload.sid === 'string') await sessions.revoke(payload.sid);
  }

  /*
   * FUNÇÃO INTERNA: getCurrentUser (async)
   * O que faz: devolve o usuário logado (para GET /me).
   * Parâmetros: id (UUID do usuário).
   * Retorno: serializeUser(user). Lança 401 se o usuário não puder mais acessar.
   */
  async function getCurrentUser(id) {
    const user = await repository.findById(id);
    if (!user || !user.ativo || getPermissionsForRole(user.cargo).length === 0) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    return serializeUser(user);
  }

  /*
   * FUNÇÃO INTERNA: changeOwnPassword (async)
   * O que faz: troca a senha do próprio usuário.
   * Parâmetros:
   *   - userId (UUID).
   *   - corpo { senha_atual, nova_senha } (renomeados para senhaAtual e novaSenha na desestruturação).
   *   - opções { sessionId }: a sessão atual (que continua ativa).
   * Retorno: nada. Lança 401, 422 (senha atual incorreta) ou 422 (senha fraca).
   */
  async function changeOwnPassword(userId, { senha_atual: senhaAtual, nova_senha: novaSenha }, { sessionId } = {}) {
    // Busca o usuário COM o hash da senha (as outras buscas não trazem a senha).
    const user = await repository.findByIdWithPassword(userId);
    if (!user || !user.ativo) {
      throw new AppError(401, 'SESSAO_INVALIDA', 'Sessão expirada ou não autenticada.');
    }

    // Confere a senha atual.
    if (!(await comparePassword(senhaAtual, user.senha_hash))) {
      throw new AppError(422, 'SENHA_ATUAL_INCORRETA', 'A senha atual está incorreta.', [
        { field: 'senha_atual', message: 'A senha atual está incorreta.' },
      ]);
    }

    // Política de senha + não pode repetir a atual.
    const problems = getPasswordProblems(novaSenha);
    if (senhaAtual === novaSenha) problems.push('Escolha uma senha diferente da atual.');
    if (problems.length > 0) throw weakPassword(problems, 'nova_senha');

    // Grava o novo hash.
    await repository.updatePassword(userId, await hashPassword(novaSenha));
    // Outros dispositivos saem; a sessão atual continua.
    await sessions.revokeAllForUser(userId, { exceptId: sessionId || null });
  }

  /*
   * FUNÇÃO INTERNA: requestPasswordReset (async)
   * O que faz: se o e-mail for de um usuário ativo, envia o link de redefinição (em segundo plano).
   * Parâmetros: { email }.
   * Retorno: nada (sempre "sucesso" para quem chamou).
   */
  // "Esqueci minha senha": a resposta é sempre a mesma (não revela se o e-mail existe) e o e-mail
  // sai em segundo plano, para o tempo de resposta também não revelar.
  async function requestPasswordReset({ email } = {}) {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = normalized ? await repository.findByEmail(normalized) : null;
    if (user && user.ativo && getPermissionsForRole(user.cargo).length > 0) {
      // SEM "await": a Promise roda em segundo plano. .then/.catch tratam o resultado depois,
      // registrando no log se o envio não aconteceu.
      accessLinks.send(user, 'redefinicao').then((result) => {
        if (!result.enviado) log.error('email_redefinicao_nao_enviado', { module: 'auth', entityId: user.id });
      }).catch((error) => {
        log.error('email_redefinicao_falhou', { module: 'auth', entityId: user.id, code: error.code });
      });
    }
  }

  /*
   * FUNÇÃO INTERNA: resetPassword (async)
   * O que faz: define a nova senha a partir do token do link.
   * Parâmetros: { token, nova_senha }.
   * Retorno: { email, finalidade, usuarioId }. Lança 422 (senha fraca) ou 400 (link inválido).
   */
  // Define a senha pelo link de redefinição ou de convite: uso único, e todas as sessões do usuário caem.
  async function resetPassword({ token, nova_senha: novaSenha } = {}) {
    // Valida a senha antes de mexer no banco.
    const problems = getPasswordProblems(novaSenha);
    if (problems.length > 0) throw weakPassword(problems, 'nova_senha');
    // Calcula o hash fora da transação (é lento; assim a transação fica curta).
    const senhaHash = await hashPassword(novaSenha);

    // Tudo dentro de uma transação: consumir o link, trocar a senha e encerrar as sessões.
    return transaction(async (db) => {
      const link = await accessLinks.consume(db, token);
      if (!link) {
        throw new AppError(400, 'LINK_INVALIDO', 'Este link é inválido ou já expirou. Peça um novo link.');
      }
      await repository.updatePassword(link.usuario_id, senhaHash, db);
      await sessions.revokeAllForUser(link.usuario_id, { db });
      return { email: link.email, finalidade: link.finalidade, usuarioId: link.usuario_id };
    });
  }

  return { login, refresh, logout, getCurrentUser, changeOwnPassword, requestPasswordReset, resetPassword };
}

// Exporta uma instância pronta (funções espalhadas), a fábrica (para testes) e serializeUser.
module.exports = { ...createAuthService(), createAuthService, serializeUser };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Login: valida → confere bloqueio → compara senha (tempo constante) → cria sessão → tokens.
 *   - Refresh: verifica token de renovação → limite total da sessão → sessão ativa →
 *     usuário ativo → novos tokens.
 *   - Logout: revoga a sessão do cookie.
 *   - Troca de senha: confere a atual → política → grava → derruba as outras sessões.
 *   - Esqueci/redefinir: link por e-mail em segundo plano → token de uso único →
 *     nova senha numa transação → todas as sessões caem.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Hash de senhas com bcrypt (custo, sal) e comparação em tempo constante.
 *   - JWT de acesso x JWT de renovação; inatividade x duração máxima da sessão.
 *   - Sessões no banco e revogação.
 *   - Proteção contra força bruta e enumeração de usuários.
 *   - Promises em segundo plano (sem await) com .then/.catch.
 *   - Transações e injeção de dependências.
 * ============================================================================
 */
