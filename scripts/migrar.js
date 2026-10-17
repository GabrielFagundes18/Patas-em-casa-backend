/*
 * ============================================================================
 * ARQUIVO: migrar.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SCRIPT que APLICA AS MIGRATIONS do banco de dados. "Migration" é um arquivo
 *   SQL que muda a estrutura do banco (cria tabelas, colunas, índices...). Este
 *   script aplica, em ordem, as migrations listadas em migrations/ordem.json que
 *   ainda não foram aplicadas, e registra cada uma na tabela schema_migrations
 *   junto com um CHECKSUM (impressão digital SHA-256 do conteúdo do arquivo).
 *   Se alguém alterar um arquivo já aplicado, o checksum muda e o script recusa
 *   continuar — migration aplicada não deve ser editada; cria-se uma nova.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - readOrder(): lê a ordem e o conteúdo/checksum de cada migration (exportada).
 *   - planMigrations(migrations, applied): decide quais aplicar (exportada).
 *   - main(args): conecta, cria schema_migrations, trata --baseline/--status e aplica.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - dotenv, node:crypto, node:fs, node:path, pg (Client).
 *   - migrations/ordem.json e os arquivos .sql listados nele.
 *   - Testado em tests/unit/migrar.test.js.
 * ============================================================================
 */

// Aplica as migrations listadas em migrations/ordem.json, na ordem, cada uma em uma transação,
// e registra o que foi aplicado em schema_migrations (nome + checksum SHA-256 do arquivo).
//
//   npm run db:migrate                         aplica as pendentes
//   npm run db:migrate -- --status             lista aplicadas e pendentes, sem alterar nada
//   npm run db:migrate -- --baseline <arquivo> marca como aplicada sem executar (ex.: a 000, que já
//                                              existe no Neon) — use uma vez, num banco existente
//
// Conecta por DATABASE_URL_DIRECT (conexão direta do Neon) ou, na falta dela, por DATABASE_URL.
// Carrega o .env.
require('dotenv').config();

// Hash SHA-256 (checksum).
const crypto = require('node:crypto');
// Leitura de arquivos.
const fs = require('node:fs');
// Caminhos.
const path = require('node:path');
// Client: uma conexão única com o PostgreSQL (aqui não precisamos de pool).
const { Client } = require('pg');

// Pasta das migrations (um nível acima de scripts/).
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/*
 * FUNÇÃO: readOrder (exportada)
 * O que faz: lê migrations/ordem.json e, para cada arquivo listado em "aplicar", lê o SQL e
 *   calcula o checksum.
 * Retorno (array): [{ name, sql, checksum }] na ordem de aplicação.
 */
function readOrder() {
  // JSON.parse transforma o texto JSON em objeto; pegamos a lista "aplicar".
  const { aplicar } = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, 'ordem.json'), 'utf8'));
  return aplicar.map((name) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    // createHash('sha256').update(texto).digest('hex') = impressão digital de 64 caracteres hexadecimais.
    return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  });
}

/*
 * FUNÇÃO: planMigrations (exportada)
 * O que faz: compara as migrations do disco com as já aplicadas no banco.
 * Parâmetros: migrations (de readOrder) e applied ([{ nome, checksum }] do banco).
 * Retorno (array): as migrations pendentes (ainda não aplicadas).
 * Erro: se alguma já aplicada estiver com checksum diferente (arquivo alterado).
 */
// Decide o que aplicar. Arquivo já aplicado com conteúdo diferente é erro: migration aplicada não muda.
function planMigrations(migrations, applied) {
  // Map nome → checksum gravado no banco.
  const appliedByName = new Map(applied.map((row) => [row.nome, row.checksum]));
  // Aplicadas cujo conteúdo mudou.
  const changed = migrations.filter((m) => appliedByName.has(m.name) && appliedByName.get(m.name) !== m.checksum);
  if (changed.length > 0) {
    throw new Error(`Migration já aplicada foi alterada: ${changed.map((m) => m.name).join(', ')}. Crie uma migration nova.`);
  }
  // Pendentes = as que não estão no banco.
  return migrations.filter((m) => !appliedByName.has(m.name));
}

/*
 * FUNÇÃO: main (async)
 * O que faz: executa o script.
 * Parâmetros: args (padrão: argumentos da linha de comando, sem "node" e o nome do script).
 */
async function main(args = process.argv.slice(2)) {
  // Endereço do banco (conexão direta preferida).
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Configure DATABASE_URL_DIRECT ou DATABASE_URL no .env.');
    process.exitCode = 1;
    return;
  }

  const migrations = readOrder();
  const client = new Client({ connectionString });
  await client.connect();

  // try/finally: a conexão é fechada no fim, com ou sem erro.
  try {
    // Cria a tabela de controle, se ainda não existir.
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nome varchar(200) PRIMARY KEY,
      checksum char(64) NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);
    // O que já foi aplicado ("rows: applied" renomeia rows para applied).
    const { rows: applied } = await client.query('SELECT nome, checksum FROM schema_migrations');

    // --baseline <arquivo>: marca como aplicada sem executar (para bancos que já têm aquela estrutura).
    const baselineIndex = args.indexOf('--baseline');
    if (baselineIndex >= 0) {
      // O nome do arquivo vem logo depois de --baseline.
      const target = migrations.find((m) => m.name === args[baselineIndex + 1]);
      if (!target) throw new Error(`Informe um arquivo de migrations/ordem.json após --baseline.`);
      await client.query(
        'INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2) ON CONFLICT (nome) DO NOTHING',
        [target.name, target.checksum]
      );
      console.info(`Marcada como aplicada (sem executar): ${target.name}`);
      return;
    }

    // Pendentes (ou erro, se alguma aplicada foi alterada).
    const pending = planMigrations(migrations, applied);
    // --status: só mostra a situação de cada migration.
    if (args.includes('--status')) {
      for (const m of migrations) console.info(`${pending.includes(m) ? 'pendente ' : 'aplicada '} ${m.name}`);
      return;
    }

    if (pending.length === 0) {
      console.info('Nenhuma migration pendente.');
      return;
    }

    // Aplica cada pendente na sua própria transação: ou aplica e registra, ou desfaz tudo.
    for (const migration of pending) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
        await client.query('COMMIT');
        console.info(`Aplicada: ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        // Para na primeira falha, dizendo qual migration falhou.
        throw new Error(`Falha em ${migration.name}: ${error.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

// Só roda main() quando executado diretamente (o teste importa readOrder/planMigrations).
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

// Exporta as funções testáveis.
module.exports = { readOrder, planMigrations };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. Lê ordem.json e calcula o checksum de cada migration.
 *   2. Conecta, garante a tabela schema_migrations e lê o que já foi aplicado.
 *   3. --baseline marca uma migration como aplicada; --status só lista.
 *   4. Sem opções: confere checksums (erro se alguma aplicada mudou) e aplica as
 *      pendentes, uma por transação, registrando nome e checksum.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Migrations de banco de dados e versionamento do schema.
 *   - Checksum (SHA-256) para detectar alterações em arquivos.
 *   - Transações DDL no PostgreSQL (BEGIN/COMMIT/ROLLBACK com CREATE/ALTER).
 *   - Argumentos de linha de comando (process.argv) e flags (--status, --baseline).
 *   - Por que nunca editar uma migration já aplicada (por isso estes comentários não
 *     foram colocados nas migrations 000 e 009–013).
 * ============================================================================
 */
