/*
 * ============================================================================
 * ARQUIVO: user-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE da EQUIPE (usuários do painel), com regras de segurança:
 *     - criar membro com senha inicial forte OU com convite por e-mail;
 *     - editar nome, e-mail, cargo e situação (ativo);
 *     - ninguém altera o próprio cargo nem se desativa;
 *     - sempre deve existir ao menos um administrador ativo;
 *     - desativar ou redefinir a senha encerra as sessões da pessoa;
 *     - tudo é auditado.
 *
 * PRINCIPAIS ITENS:
 *   - BCRYPT_ROUNDS.
 *   - serializeUser, assertStrongPassword, emailInUse (internas).
 *   - createUserService(repository, deps) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto, bcryptjs, utils/app-error, config/permissions, utils/password-policy, utils/pagination.
 *   - ./user-repository, auth/session-repository, auth/access-link-service, audit/audit-service.
 *   - Usado por: ./user-controller.js. Testado em tests/unit/user-service.test.js.
 * ============================================================================
 */

// Bytes aleatórios (senha "invisível" de quem recebe convite).
const { randomBytes } = require('node:crypto');
// Hash de senhas.
const bcrypt = require('bcryptjs');
// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Permissões por cargo.
const { getPermissionsForRole } = require('../../config/permissions');
// Política de senha.
const { getPasswordProblems } = require('../../utils/password-policy');
// Paginação.
const { parsePagination } = require('../../utils/pagination');
// Banco: usuários e sessões.
const userRepository = require('./user-repository');
const sessionRepository = require('../auth/session-repository');
// Auditoria.
const auditService = require('../audit/audit-service');
// Convites por e-mail.
const accessLinkService = require('../auth/access-link-service');

// Custo do bcrypt.
const BCRYPT_ROUNDS = 12;

// Usuário + lista de permissões do cargo.
function serializeUser(user) {
  return { ...user, permissions: getPermissionsForRole(user.cargo) };
}

/*
 * FUNÇÃO: assertStrongPassword (interna)
 * O que faz: lança 422 (SENHA_FRACA) com um detalhe por problema, se a senha não cumprir a política.
 */
function assertStrongPassword(password, field) {
  const problems = getPasswordProblems(password);
  if (problems.length > 0) {
    throw new AppError(422, 'SENHA_FRACA', 'A senha não atende à política de senha.', problems.map((message) => ({ field, message })));
  }
}

// Erro 409: e-mail já usado por outro usuário.
function emailInUse() {
  return new AppError(409, 'EMAIL_EM_USO', 'Já existe um usuário com este e-mail.', [
    { field: 'email', message: 'Use outro e-mail.' },
  ]);
}

/*
 * FUNÇÃO: createUserService (fábrica)
 * Parâmetros: repository e { audit, hashPassword, sessions, accessLinks }.
 * Retorno: { list, getById, create, update, resetPassword, sendInvite }.
 */
function createUserService(repository = userRepository, {
  audit = auditService,
  hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  sessions = sessionRepository,
  accessLinks = accessLinkService,
} = {}) {
  /*
   * list: filtros convertidos ("ativo" texto → booleano) e usuários com permissões.
   */
  async function list(query = {}) {
    const { items, total } = await repository.list({
      ...parsePagination(query),
      q: query.q ? String(query.q).trim() : '',
      cargo: query.cargo,
      ativo: query.ativo === undefined ? undefined : query.ativo === 'true',
      sort: query.sort,
      order: query.order?.toLowerCase(),
    });
    return { items: items.map(serializeUser), total };
  }

  /*
   * getById: usuário ou 404.
   */
  async function getById(id) {
    const user = await repository.findById(id);
    if (!user) throw new AppError(404, 'USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');
    return serializeUser(user);
  }

  /*
   * create: cria o membro.
   * - Se uma senha foi enviada, ou se NÃO for convite, a senha precisa ser forte.
   * - Convite sem senha: a conta recebe uma senha aleatória longa que ninguém conhece
   *   (a pessoa define a dela pelo link do e-mail).
   * Retorno: o usuário + "convite" (resultado do envio ou null).
   */
  // Com enviar_convite, a pessoa recebe por e-mail um link para criar a própria senha; sem senha
  // informada, a conta nasce com uma senha aleatória que ninguém conhece.
  async function create(payload, actor = {}) {
    const invite = payload.enviar_convite === true;
    if (payload.senha !== undefined || !invite) assertStrongPassword(payload.senha, 'senha');
    // "??": usa a senha enviada; se não houver, gera uma aleatória.
    const initialPassword = payload.senha ?? randomBytes(32).toString('base64url');

    let user;
    try {
      user = await repository.create({
        nome: payload.nome.trim(),
        email: payload.email.trim().toLowerCase(),
        senhaHash: await hashPassword(initialPassword),
        cargo: payload.cargo,
        ativo: payload.ativo ?? true,
      });
    } catch (error) {
      // 23505 = valor único repetido (e-mail).
      if (error.code === '23505') throw emailInUse();
      throw error;
    }

    await audit.record({ actor, action: 'criar', module: 'team', entity: 'usuario', entityId: user.id, after: user });
    const convite = invite ? await accessLinks.send(user, 'convite') : null;
    return { ...serializeUser(user), convite };
  }

  /*
   * sendInvite: (re)envia o convite para um usuário ativo (409 se inativo).
   * Retorno: { enviado, motivo? }.
   */
  // (Re)envia o convite: um link novo para a pessoa criar a senha; os links anteriores deixam de valer.
  async function sendInvite(id, actor = {}) {
    const user = await getById(id);
    if (!user.ativo) {
      throw new AppError(409, 'USUARIO_INATIVO', 'Reative o usuário antes de enviar o convite.');
    }
    const result = await accessLinks.send(user, 'convite');
    await audit.record({ actor, action: 'enviar_convite', module: 'team', entity: 'usuario', entityId: id, after: { enviado: result.enviado } });
    return result;
  }

  /*
   * update: edita o membro com as regras de segurança.
   */
  async function update(id, payload, actor = {}) {
    const current = await getById(id);
    // Monta só as alterações enviadas (normalizadas).
    const changes = {};
    if (payload.nome !== undefined) changes.nome = payload.nome.trim();
    if (payload.email !== undefined) changes.email = payload.email.trim().toLowerCase();
    if (payload.cargo !== undefined) changes.cargo = payload.cargo;
    if (payload.ativo !== undefined) changes.ativo = payload.ativo;

    // Regra 1: ninguém muda o próprio cargo nem desativa a própria conta.
    const changesOwnAccess = (changes.cargo !== undefined && changes.cargo !== current.cargo) || changes.ativo === false;
    if (id === actor.userId && changesOwnAccess) {
      throw new AppError(409, 'ALTERACAO_PROPRIA_BLOQUEADA', 'Você não pode alterar o próprio cargo nem desativar a própria conta.');
    }

    // Regra 2: não pode ficar sem nenhum administrador ativo.
    const removesAdministrator = current.cargo === 'administrador' && current.ativo
      && ((changes.cargo !== undefined && changes.cargo !== 'administrador') || changes.ativo === false);
    if (removesAdministrator && (await repository.countActiveAdministrators()) <= 1) {
      throw new AppError(409, 'ULTIMO_ADMINISTRADOR', 'É preciso manter ao menos um administrador ativo.');
    }

    let user;
    try {
      user = await repository.update(id, changes);
    } catch (error) {
      if (error.code === '23505') throw emailInUse();
      throw error;
    }

    // Auditoria só do que mudou.
    const changed = Object.keys(changes).filter((field) => current[field] !== user[field]);
    if (changed.length > 0) {
      await audit.record({
        actor,
        action: 'editar',
        module: 'team',
        entity: 'usuario',
        entityId: id,
        before: Object.fromEntries(changed.map((field) => [field, current[field]])),
        after: Object.fromEntries(changed.map((field) => [field, user[field]])),
      });
    }

    // Desativado sai de todas as sessões na hora.
    if (changes.ativo === false && current.ativo) await sessions.revokeAllForUser(id);

    return serializeUser(user);
  }

  /*
   * resetPassword: o administrador define uma nova senha (forte) para o membro;
   * todas as sessões dele são encerradas; a ação é auditada.
   */
  async function resetPassword(id, { nova_senha: novaSenha }, actor = {}) {
    await getById(id);
    assertStrongPassword(novaSenha, 'nova_senha');
    await repository.updatePassword(id, await hashPassword(novaSenha));
    await sessions.revokeAllForUser(id);
    await audit.record({ actor, action: 'redefinir_senha', module: 'team', entity: 'usuario', entityId: id });
  }

  return { list, getById, create, update, resetPassword, sendInvite };
}

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createUserService(), createUserService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - create: valida a senha (ou gera uma aleatória para convite) → hash → grava →
 *     audita → envia convite se pedido.
 *   - update: normaliza → bloqueia mudanças no próprio acesso → protege o último
 *     administrador → grava → audita → encerra sessões se desativado.
 *   - resetPassword / sendInvite: nova senha (sessões caem) ou novo link por e-mail.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Regras de proteção contra "auto-bloqueio" e perda do último administrador.
 *   - Fluxo de convite x senha inicial.
 *   - Revogação de sessões após mudanças de segurança.
 *   - Operador ?? (coalescência nula) para valores padrão.
 * ============================================================================
 */
