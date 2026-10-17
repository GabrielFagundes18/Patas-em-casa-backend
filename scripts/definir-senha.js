/*
 * ============================================================================
 * ARQUIVO: definir-senha.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SCRIPT de linha de comando para DEFINIR A SENHA de um usuário do painel
 *   direto no banco (útil para criar o primeiro acesso ou recuperar uma conta
 *   sem e-mail configurado). A senha é digitada no terminal aparecendo como "*".
 *   Uso: npm run definir-senha -- email@patasemcasa.org
 *
 * PRINCIPAIS FUNÇÕES:
 *   - validatePassword(password, confirmation): confere a política e a confirmação (exportada).
 *   - setUserPassword(database, email, password): grava o hash da senha (exportada).
 *   - askMasked(question): pergunta mostrando "*" no lugar de cada caractere.
 *   - createPasswordPrompt(): escolhe entre terminal interativo e entrada redirecionada.
 *   - main(): fluxo completo do script.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - dotenv, node:readline, bcryptjs, ../src/db/pool, ../src/utils/password-policy.
 *   - Testado em tests/unit/definir-senha.test.js.
 * ============================================================================
 */

// Carrega o .env (precisa do DATABASE_URL).
require('dotenv').config();

// readline: lê a entrada linha por linha.
const readline = require('node:readline');
// Hash de senhas.
const bcrypt = require('bcryptjs');
// Pool de conexões com o banco.
const pool = require('../src/db/pool');
// Política de senha (a mesma da API).
const { MIN_PASSWORD_LENGTH, getPasswordProblems } = require('../src/utils/password-policy');

// Custo do bcrypt (igual ao da API).
const BCRYPT_ROUNDS = 12;

/*
 * FUNÇÃO: validatePassword (exportada)
 * O que faz: confere a política de senha e se a confirmação é igual.
 * Retorno: texto com o problema, ou null se estiver tudo certo.
 */
// Mesma política de senha da API (src/utils/password-policy.js).
function validatePassword(password, confirmation) {
  const problems = getPasswordProblems(password);
  if (problems.length > 0) return problems.join(' ');
  if (password !== confirmation) return 'As senhas não conferem.';
  return null;
}

/*
 * FUNÇÃO: setUserPassword (async, exportada)
 * O que faz: calcula o hash e grava na conta com o e-mail informado.
 * Parâmetros: database (pool ou um banco falso nos testes), email, password.
 * Retorno: { nome, cargo } do usuário, ou null se o e-mail não existir.
 */
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

/*
 * FUNÇÃO: askMasked
 * O que faz: faz uma pergunta no terminal e lê a resposta tecla por tecla, mostrando "*".
 * Parâmetros: question (string).
 * Retorno (Promise<string>): o texto digitado, quando a pessoa aperta Enter.
 * Detalhe: o "modo raw" (setRawMode(true)) entrega cada tecla assim que é pressionada, sem
 *   o terminal mostrar o caractere — por isso conseguimos escrever "*" no lugar.
 */
// Terminal interativo: lê tecla a tecla e mostra * para cada caractere digitado.
function askMasked(question) {
  return new Promise((resolve) => {
    // Entrada e saída padrão do terminal.
    const { stdin, stdout } = process;
    // Texto digitado até agora.
    let value = '';

    // Encerra a leitura: para de ouvir, volta o terminal ao normal e entrega o valor.
    function finish() {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      resolve(value);
    }

    // Recebe cada "pedaço" digitado (pode conter várias teclas, ex.: texto colado).
    function onData(chunk) {
      // Array.from separa o texto em caracteres (inclusive emojis corretamente).
      const chars = Array.from(chunk);

      for (let index = 0; index < chars.length; index += 1) {
        const char = chars[index];

        // Setas, Delete etc. chegam como ESC [ ... <byte final>; a sequência inteira é ignorada,
        // mesmo quando vem no meio de outros caracteres (digitação rápida ou texto colado).
        // '\u001b' = tecla ESC (código 27).
        if (char === '\u001b') {
          if (chars[index + 1] === '[' || chars[index + 1] === 'O') {
            // Pula "ESC [" e avança até o caractere final da sequência (entre '@' e '~').
            index += 2;
            while (index < chars.length && !(chars[index] >= '@' && chars[index] <= '~')) index += 1;
          }
          continue;
        }

        // Enter: termina.
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        // Ctrl+C ('\u0003'): cancela o script (código de saída 130 é o padrão para interrupção).
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\nOperação cancelada.\n');
          process.exit(130);
        }
        // Backspace ('\u007f' ou '\b'): apaga o último caractere e o último "*" da tela
        // ("\b \b" = volta uma posição, escreve espaço, volta de novo).
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
        } else if (char >= ' ') {
          // Caractere imprimível: guarda e mostra "*".
          value += char;
          stdout.write('*');
        }
      }
    }

    // Mostra a pergunta e liga o modo de leitura tecla a tecla.
    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/*
 * FUNÇÃO: createPasswordPrompt
 * O que faz: escolhe como ler a senha:
 *   - terminal de verdade (isTTY): askMasked;
 *   - entrada redirecionada (ex.: "printf 'senha\nsenha\n' | npm run definir-senha -- email"):
 *     lê uma linha por pergunta.
 * Retorno: { ask(question), close() }.
 */
function createPasswordPrompt() {
  if (process.stdin.isTTY) {
    return { ask: askMasked, close: () => {} };
  }

  // Entrada redirecionada (ex.: printf ... | npm run definir-senha): uma senha por linha.
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  // Iterador assíncrono: cada lines.next() devolve a próxima linha.
  const lines = rl[Symbol.asyncIterator]();

  async function ask(question) {
    process.stdout.write(question);
    const { value, done } = await lines.next();
    process.stdout.write('\n');
    // Acabou a entrada: devolve texto vazio.
    return done ? '' : value;
  }

  return { ask, close: () => rl.close() };
}

/*
 * FUNÇÃO: main (async)
 * O que faz: lê o e-mail dos argumentos, pede a senha duas vezes, valida e grava.
 * Em erro, define process.exitCode = 1 (o terminal entende que o comando falhou).
 */
async function main() {
  // process.argv[2] = primeiro argumento depois de "node script.js".
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

  // "finally" garante que o leitor seja fechado mesmo se der erro.
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
    // Fecha as conexões com o banco para o script terminar.
    await pool.end();
  }
}

// Só executa main() quando rodado diretamente (não quando importado pelo teste).
if (require.main === module) {
  main().catch((error) => {
    console.error(`Não foi possível definir a senha: ${error.message}`);
    process.exitCode = 1;
  });
}

// Exporta as funções testáveis.
module.exports = { setUserPassword, validatePassword };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. Confere o e-mail do argumento e o DATABASE_URL.
 *   2. Pede a senha e a confirmação (com "*" no terminal ou por linhas redirecionadas).
 *   3. Valida a política de senha e a confirmação.
 *   4. Grava o hash bcrypt na conta e fecha o banco.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Scripts de linha de comando com Node (process.argv, process.exitCode).
 *   - Terminal em modo "raw", sequências de escape (ESC) e códigos de controle (Ctrl+C, Backspace).
 *   - process.stdin.isTTY (terminal x entrada redirecionada / "pipe").
 *   - readline e iteradores assíncronos (Symbol.asyncIterator).
 *   - Promises criadas à mão (new Promise(resolve => ...)).
 * ============================================================================
 */
