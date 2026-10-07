function validateLogin({ body }) {
  const details = [];

  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    details.push({ field: 'email', message: 'Informe um e-mail válido.' });
  }

  if (typeof body.password !== 'string' || body.password.length === 0) {
    details.push({ field: 'password', message: 'Informe a senha.' });
  }

  if (typeof body.password === 'string' && body.password.length > 128) {
    details.push({ field: 'password', message: 'A senha excede o tamanho permitido.' });
  }

  return details;
}

module.exports = validateLogin;