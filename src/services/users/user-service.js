const bcrypt = require('bcryptjs');
const AppError = require('../../utils/app-error');
const { getPermissionsForRole } = require('../../config/permissions');
const { getPasswordProblems } = require('../../utils/password-policy');
const { parsePagination } = require('../../utils/pagination');
const userRepository = require('../../repositories/auth/user-repository');
const auditService = require('../audit/audit-service');

const BCRYPT_ROUNDS = 12;

function serializeUser(user) {
  return { ...user, permissions: getPermissionsForRole(user.cargo) };
}

function assertStrongPassword(password, field) {
  const problems = getPasswordProblems(password);
  if (problems.length > 0) {
    throw new AppError(422, 'SENHA_FRACA', 'A senha não atende à política de senha.', problems.map((message) => ({ field, message })));
  }
}

function emailInUse() {
  return new AppError(409, 'EMAIL_EM_USO', 'Já existe um usuário com este e-mail.', [
    { field: 'email', message: 'Use outro e-mail.' },
  ]);
}

function createUserService(repository = userRepository, {
  audit = auditService,
  hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
} = {}) {
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

  async function getById(id) {
    const user = await repository.findById(id);
    if (!user) throw new AppError(404, 'USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.');
    return serializeUser(user);
  }

  async function create(payload, actor = {}) {
    assertStrongPassword(payload.senha, 'senha');

    let user;
    try {
      user = await repository.create({
        nome: payload.nome.trim(),
        email: payload.email.trim().toLowerCase(),
        senhaHash: await hashPassword(payload.senha),
        cargo: payload.cargo,
        ativo: payload.ativo ?? true,
      });
    } catch (error) {
      if (error.code === '23505') throw emailInUse();
      throw error;
    }

    await audit.record({ actor, action: 'criar', module: 'team', entity: 'usuario', entityId: user.id, after: user });
    return serializeUser(user);
  }

  async function update(id, payload, actor = {}) {
    const current = await getById(id);
    const changes = {};
    if (payload.nome !== undefined) changes.nome = payload.nome.trim();
    if (payload.email !== undefined) changes.email = payload.email.trim().toLowerCase();
    if (payload.cargo !== undefined) changes.cargo = payload.cargo;
    if (payload.ativo !== undefined) changes.ativo = payload.ativo;

    const changesOwnAccess = (changes.cargo !== undefined && changes.cargo !== current.cargo) || changes.ativo === false;
    if (id === actor.userId && changesOwnAccess) {
      throw new AppError(409, 'ALTERACAO_PROPRIA_BLOQUEADA', 'Você não pode alterar o próprio cargo nem desativar a própria conta.');
    }

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

    return serializeUser(user);
  }

  async function resetPassword(id, { nova_senha: novaSenha }, actor = {}) {
    await getById(id);
    assertStrongPassword(novaSenha, 'nova_senha');
    await repository.updatePassword(id, await hashPassword(novaSenha));
    await audit.record({ actor, action: 'redefinir_senha', module: 'team', entity: 'usuario', entityId: id });
  }

  return { list, getById, create, update, resetPassword };
}

module.exports = { ...createUserService(), createUserService };
