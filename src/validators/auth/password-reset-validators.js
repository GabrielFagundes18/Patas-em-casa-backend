const { EMAIL_PATTERN } = require('../common-validators');

function validateForgotPassword({ body }) {
  return typeof body.email === 'string' && EMAIL_PATTERN.test(body.email.trim()) && body.email.trim().length <= 150
    ? []
    : [{ field: 'email', message: 'Informe um e-mail válido.' }];
}

function validateResetPassword({ body }) {
  return [
    typeof body.token === 'string' && body.token.length >= 20 && body.token.length <= 200
      ? null
      : { field: 'token', message: 'Link inválido. Abra novamente o link recebido por e-mail.' },
    typeof body.nova_senha === 'string' && body.nova_senha.length > 0 && body.nova_senha.length <= 128
      ? null
      : { field: 'nova_senha', message: 'Informe a nova senha (até 128 caracteres).' },
  ].filter(Boolean);
}

module.exports = { validateForgotPassword, validateResetPassword };
