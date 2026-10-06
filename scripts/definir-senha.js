require('dotenv').config();

const readline = require('node:readline');
const bcrypt = require('bcryptjs');
const pool = require('../src/db/db');
const { MIN_PASSWORD_LENGTH, getPasswordProblems } = require('../src/utils/password-policy');

const BCRYPT_ROUNDS = 12;

// Mesma política de senha da API (src/utils/password-policy.js).
function validatePassword(password, confirmation) {
  const problems = getPasswordProblems(password);
  if (problems.length > 0) return problems.join(' ');
  if (password !== confirmation) return 'As senhas não conferem.';
  return null;
}

async function setUserPassword(database, email, password) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await database.query(
    `UPDATE usuarios
     SET senha_hash = $1
     WHERE LOWER(email) = $2
     RETURNING nome, cargo`,
    [passwordHash, email.trim().toLowerCase()]
  );

  return result.rows[0] || null;
}

// Terminal interativo: lê tecla a tecla e mostra * para cada caractere digitado.
function askMasked(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let value = '';

    function finish() {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      resolve(value);
    }

    function onData(chunk) {
      const chars = Array.from(chunk);

      for (let index = 0; index < chars.length; index += 1) {
        const char = chars[index];

        // Setas, Delete etc. chegam como ESC [ ... <byte final>; a sequência inteira é ignorada,
        // mesmo quando vem no meio de outros caracteres (digitação rápida ou texto colado).
        if (char === '\u001b') {
          if (chars[index + 1] === '[' || chars[index + 1] === 'O') {
            index += 2;
            while (index < chars.length && !(chars[index] >= '@' && chars[index] <= '~')) index += 1;
          }
          continue;
        }

        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\nOperação cancelada.\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
        } else if (char >= ' ') {
          value += char;
          stdout.write('*');
        }
      }
    }

    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function createPasswordPrompt() {
  if (process.stdin.isTTY) {
    return { ask: askMasked, close: () => {} };
  }

  // Entrada redirecionada (ex.: printf ... | npm run definir-senha): uma senha por linha.
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();

  async function ask(question) {
    process.stdout.write(question);
    const { value, done } = await lines.next();
    process.stdout.write('\n');
    return done ? '' : value;
  }

  return { ask, close: () => rl.close() };
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Uso: npm run definir-senha -- email@patasemcasa.org');
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não está configurada no .env.');
    process.exitCode = 1;
    return;
  }

  console.info(`Definindo a senha de ${email}.`);
  console.info(`Digite a senha (mínimo ${MIN_PASSWORD_LENGTH} caracteres) e pressione Enter; ela aparece como *.`);

  const prompt = createPasswordPrompt();
  let password;
  let confirmation;

  try {
    password = await prompt.ask(`Nova senha para ${email}: `);
    confirmation = await prompt.ask('Confirme a nova senha: ');
  } finally {
    prompt.close();
  }

  const problem = validatePassword(password, confirmation);
  if (problem) {
    console.error(problem);
    process.exitCode = 1;
    return;
  }

  try {
    const user = await setUserPassword(pool, email, password);
    if (!user) {
      console.error(`Nenhum usuário encontrado com o e-mail ${email}.`);
      process.exitCode = 1;
      return;
    }

    console.info(`Senha definida para ${user.nome} (${user.cargo}).`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Não foi possível definir a senha: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { setUserPassword, validatePassword };
