// Aplica as migrations listadas em migrations/ordem.json, na ordem, cada uma em uma transação,
// e registra o que foi aplicado em schema_migrations (nome + checksum SHA-256 do arquivo).
//
//   npm run db:migrate                         aplica as pendentes
//   npm run db:migrate -- --status             lista aplicadas e pendentes, sem alterar nada
//   npm run db:migrate -- --baseline <arquivo> marca como aplicada sem executar (ex.: a 000, que já
//                                              existe no Neon) — use uma vez, num banco existente
//
// Conecta por DATABASE_URL_DIRECT (conexão direta do Neon) ou, na falta dela, por DATABASE_URL.
require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function readOrder() {
  const { aplicar } = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, 'ordem.json'), 'utf8'));
  return aplicar.map((name) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  });
}

// Decide o que aplicar. Arquivo já aplicado com conteúdo diferente é erro: migration aplicada não muda.
function planMigrations(migrations, applied) {
  const appliedByName = new Map(applied.map((row) => [row.nome, row.checksum]));
  const changed = migrations.filter((m) => appliedByName.has(m.name) && appliedByName.get(m.name) !== m.checksum);
  if (changed.length > 0) {
    throw new Error(`Migration já aplicada foi alterada: ${changed.map((m) => m.name).join(', ')}. Crie uma migration nova.`);
  }
  return migrations.filter((m) => !appliedByName.has(m.name));
}

async function main(args = process.argv.slice(2)) {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Configure DATABASE_URL_DIRECT ou DATABASE_URL no .env.');
    process.exitCode = 1;
    return;
  }

  const migrations = readOrder();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nome varchar(200) PRIMARY KEY,
      checksum char(64) NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows: applied } = await client.query('SELECT nome, checksum FROM schema_migrations');

    const baselineIndex = args.indexOf('--baseline');
    if (baselineIndex >= 0) {
      const target = migrations.find((m) => m.name === args[baselineIndex + 1]);
      if (!target) throw new Error(`Informe um arquivo de migrations/ordem.json após --baseline.`);
      await client.query(
        'INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2) ON CONFLICT (nome) DO NOTHING',
        [target.name, target.checksum]
      );
      console.info(`Marcada como aplicada (sem executar): ${target.name}`);
      return;
    }

    const pending = planMigrations(migrations, applied);
    if (args.includes('--status')) {
      for (const m of migrations) console.info(`${pending.includes(m) ? 'pendente ' : 'aplicada '} ${m.name}`);
      return;
    }

    if (pending.length === 0) {
      console.info('Nenhuma migration pendente.');
      return;
    }

    for (const migration of pending) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (nome, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
        await client.query('COMMIT');
        console.info(`Aplicada: ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha em ${migration.name}: ${error.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { readOrder, planMigrations };
