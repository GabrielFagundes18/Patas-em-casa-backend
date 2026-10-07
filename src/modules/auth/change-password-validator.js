function validateChangePassword({ body }) {
  const details = [];

  if (typeof body.senha_atual !== 'string' || body.senha_atual.length === 0 || body.senha_atual.length > 128) {
    details.push({ field: 'senha_atual', message: 'Informe a senha atual.' });
  }

  if (typeof body.nova_senha !== 'string' || body.nova_senha.length === 0 || body.nova_senha.length > 128) {
    details.push({ field: 'nova_senha', message: 'Informe a nova senha (até 128 caracteres).' });
  }

  return details;
}

module.exports = validateChangePassword;
