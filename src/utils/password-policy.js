const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES = 72;

// Política de senha forte: tamanho mínimo, letras e números, e limite de 72 bytes do bcrypt
// (acima disso o bcrypt ignoraria o restante da senha).
function getPasswordProblems(password) {
  if (typeof password !== 'string') return ['Informe a senha.'];

  const problems = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (!/[A-Za-zÀ-ÿ]/.test(password)) problems.push('Inclua ao menos uma letra.');
  if (!/\d/.test(password)) problems.push('Inclua ao menos um número.');
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) problems.push(`Use no máximo ${MAX_PASSWORD_BYTES} bytes.`);
  return problems;
}

module.exports = { MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES, getPasswordProblems };
