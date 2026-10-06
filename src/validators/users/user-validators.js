const { user } = require('../../config/domain-values');
const {
  emailDetail,
  enumDetail,
  listQueryDetails,
  textDetail,
} = require('../common-validators');

const SORT_FIELDS = ['nome', 'email', 'cargo', 'criado_em'];

function validateListUsers({ query }) {
  const details = listQueryDetails(query, SORT_FIELDS);
  const cargo = enumDetail(query.cargo, 'cargo', user.roles);
  if (cargo) details.push(cargo);
  if (query.ativo !== undefined && !['true', 'false'].includes(query.ativo)) {
    details.push({ field: 'ativo', message: 'Informe true ou false.' });
  }
  return details;
}

function validateCreateUser({ body }) {
  return [
    textDetail(body, 'nome', { min: 2, max: 150, required: true, message: 'Informe o nome completo.' }),
    emailDetail(body, true),
    body.cargo === undefined
      ? { field: 'cargo', message: 'Informe o cargo.' }
      : enumDetail(body.cargo, 'cargo', user.roles),
    // Senha inicial só é dispensada quando a pessoa vai criar a própria senha pelo convite.
    (body.senha === undefined && body.enviar_convite === true)
      || (typeof body.senha === 'string' && body.senha.length > 0 && body.senha.length <= 128)
      ? null
      : { field: 'senha', message: 'Informe a senha inicial (até 128 caracteres) ou envie um convite por e-mail.' },
    body.enviar_convite === undefined || typeof body.enviar_convite === 'boolean'
      ? null
      : { field: 'enviar_convite', message: 'Informe true ou false.' },
    body.ativo === undefined || typeof body.ativo === 'boolean'
      ? null
      : { field: 'ativo', message: 'Informe true ou false.' },
  ].filter(Boolean);
}

function validateUpdateUser({ body }) {
  if (!['nome', 'email', 'cargo', 'ativo'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }

  return [
    textDetail(body, 'nome', { min: 2, max: 150, message: 'Informe o nome completo.' }),
    emailDetail(body, false),
    enumDetail(body.cargo, 'cargo', user.roles),
    body.ativo === undefined || typeof body.ativo === 'boolean'
      ? null
      : { field: 'ativo', message: 'Informe true ou false.' },
  ].filter(Boolean);
}

function validateResetPassword({ body }) {
  return typeof body.nova_senha === 'string' && body.nova_senha.length > 0 && body.nova_senha.length <= 128
    ? []
    : [{ field: 'nova_senha', message: 'Informe a nova senha (até 128 caracteres).' }];
}

module.exports = { validateListUsers, validateCreateUser, validateUpdateUser, validateResetPassword };
