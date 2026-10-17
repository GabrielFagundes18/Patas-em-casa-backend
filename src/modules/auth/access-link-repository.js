/*
 * ============================================================================
 * ARQUIVO: access-link-repository.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   REPOSITORY (camada que conversa com o banco) dos LINKS DE ACESSO enviados
 *   por e-mail: "redefinição de senha" e "convite" de novo membro. Por
 *   segurança, o banco guarda só o HASH do token (uma "impressão digital"),
 *   nunca o token em si — assim, quem ler o banco não consegue usar os links.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - invalidatePending(db, usuarioId): marca como usados os links pendentes do usuário.
 *   - create(db, {...}): grava um novo link.
 *   - findValidForUpdate(db, tokenHash): busca um link válido e o "trava" na transação.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../db/pool.
 *   - Tabela tokens_redefinicao_acesso (migration 010) e tabela usuarios.
 *   - Usado por: ./access-link-service.js.
 * ============================================================================
 */

// Pool de conexões (usado quando não é passada uma conexão de transação).
const pool = require('../../db/pool');

/*
 * FUNÇÃO: invalidatePending (async)
 * O que faz: marca como usados (usado_em = agora) todos os links ainda não usados do usuário.
 * Parâmetros:
 *   - db (pool ou client de transação, padrão: pool): onde executar a consulta.
 *   - usuarioId (string UUID).
 * Retorno: nada.
 * Obs.: "db = pool" é um parâmetro padrão; quem chama passa "undefined" para usar o pool.
 */
// Links de redefinição de senha e convite (migration 010). Só o hash do token é guardado.
async function invalidatePending(db = pool, usuarioId) {
  // $1 é substituído com segurança pelo primeiro valor da lista (usuarioId).
  await db.query(
    'UPDATE tokens_redefinicao_acesso SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL',
    [usuarioId]
  );
}

/*
 * FUNÇÃO: create (async)
 * O que faz: grava um novo link de acesso.
 * Parâmetros:
 *   - db (padrão: pool).
 *   - objeto { usuarioId, tokenHash (Buffer), finalidade ('redefinicao' | 'convite'), expiraEm (Date) }.
 * Retorno: nada.
 */
async function create(db = pool, { usuarioId, tokenHash, finalidade, expiraEm }) {
  await db.query(
    'INSERT INTO tokens_redefinicao_acesso (usuario_id, token_hash, finalidade, expira_em) VALUES ($1, $2, $3, $4)',
    [usuarioId, tokenHash, finalidade, expiraEm]
  );
}

/*
 * FUNÇÃO: findValidForUpdate (async)
 * O que faz: busca o link pelo hash do token, desde que não usado e não expirado,
 *   junto com os dados do usuário (JOIN). "FOR UPDATE OF t" trava a linha do link
 *   até o fim da transação.
 * Parâmetros:
 *   - db (client de transação — obrigatório, para a trava fazer sentido).
 *   - tokenHash (Buffer): hash SHA-256 do token recebido.
 * Retorno: { id, usuario_id, finalidade, nome, email, cargo, ativo } ou null.
 */
// Trava o link (FOR UPDATE) para que dois envios simultâneos do mesmo link não usem o token duas vezes.
async function findValidForUpdate(db, tokenHash) {
  // "t" e "u" são apelidos das tabelas. now() é a data/hora atual no banco.
  const result = await db.query(
    `SELECT t.id, t.usuario_id, t.finalidade, u.nome, u.email, u.cargo, u.ativo
     FROM tokens_redefinicao_acesso t
     JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > now()
     FOR UPDATE OF t`,
    [tokenHash]
  );
  // result.rows = linhas encontradas; [0] = a primeira; "|| null" se não houver nenhuma.
  return result.rows[0] || null;
}

// Exporta as três funções.
module.exports = { invalidatePending, create, findValidForUpdate };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Ao emitir um link: invalidatePending (anula os antigos) → create (grava o novo hash).
 *   Ao usar o link: findValidForUpdate (busca e trava) → o service marca como usado.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Padrão Repository (isolar o SQL numa camada própria).
 *   - Guardar só o hash de tokens (como se faz com senhas).
 *   - SELECT ... FOR UPDATE e concorrência em transações.
 *   - JOIN entre tabelas e consultas parametrizadas ($1, $2...).
 * ============================================================================
 */
