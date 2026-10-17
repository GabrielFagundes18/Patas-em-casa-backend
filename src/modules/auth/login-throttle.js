/*
 * ============================================================================
 * ARQUIVO: login-throttle.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   BLOQUEIA TEMPORARIAMENTE UMA CONTA depois de várias senhas erradas seguidas,
 *   para dificultar ataques de "força bruta" (tentar milhares de senhas). A cada
 *   novo bloqueio o tempo dobra: 15 min, 30 min, 1 h, 2 h... até no máximo 4 h.
 *   Os contadores ficam na memória do servidor.
 *
 * PRINCIPAIS ITENS:
 *   - MAX_FAILURES (exportado), BASE_LOCK_MS, MAX_LOCK_MS, MAX_TRACKED_ACCOUNTS.
 *   - createLoginThrottle({ now }): cria o controle com check, registerFailure e
 *     registerSuccess (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: ./auth-service.js (login).
 * ============================================================================
 */

// Falhas seguidas que causam um bloqueio.
const MAX_FAILURES = 5;
// Primeiro bloqueio: 15 minutos.
const BASE_LOCK_MS = 15 * 60 * 1000;
// Bloqueio máximo: 4 horas.
const MAX_LOCK_MS = 4 * 60 * 60 * 1000;
// Acima deste número de contas acompanhadas, faz uma limpeza (evita uso excessivo de memória).
const MAX_TRACKED_ACCOUNTS = 10000;

/*
 * FUNÇÃO: createLoginThrottle
 * O que faz: cria um controle de tentativas independente.
 * Parâmetros: { now } (opcional) — função que devolve a hora atual; os testes passam um relógio falso.
 * Retorno: { check, registerFailure, registerSuccess }.
 */
// Bloqueio por conta após falhas seguidas, com tempo crescente (15 min, 30 min, 1 h... até 4 h).
// A chave é o e-mail digitado, exista ou não, para não revelar quais contas existem.
function createLoginThrottle({ now = () => Date.now() } = {}) {
  // e-mail → { failures: falhas seguidas, locks: quantos bloqueios já houve, lockedUntil: fim do bloqueio }.
  const accounts = new Map();

  // Normaliza o e-mail para usar como chave.
  const keyFor = (email) => String(email).trim().toLowerCase();

  /*
   * check: a conta está bloqueada agora?
   * Retorno: { locked: boolean, retryAfterMs: quanto falta para liberar }.
   */
  function check(email) {
    const entry = accounts.get(keyFor(email));
    if (entry && entry.lockedUntil > now()) {
      return { locked: true, retryAfterMs: entry.lockedUntil - now() };
    }
    return { locked: false, retryAfterMs: 0 };
  }

  /*
   * registerFailure: conta mais uma falha e bloqueia ao chegar a MAX_FAILURES.
   */
  function registerFailure(email) {
    // Muitas contas na memória: remove as que não estão bloqueadas.
    if (accounts.size > MAX_TRACKED_ACCOUNTS) {
      for (const [key, entry] of accounts) {
        if (entry.lockedUntil <= now()) accounts.delete(key);
      }
    }

    const key = keyFor(email);
    // Pega o registro existente ou começa um novo.
    const entry = accounts.get(key) || { failures: 0, locks: 0, lockedUntil: 0 };
    entry.failures += 1;

    // Chegou ao limite: novo bloqueio.
    if (entry.failures >= MAX_FAILURES) {
      entry.locks += 1;
      // Zera as falhas para a próxima rodada.
      entry.failures = 0;
      // Tempo dobra a cada bloqueio: 15 min × 2^(bloqueios − 1), sem passar de 4 h.
      // "**" é o operador de potência (2 ** 3 = 8).
      entry.lockedUntil = now() + Math.min(BASE_LOCK_MS * 2 ** (entry.locks - 1), MAX_LOCK_MS);
    }

    accounts.set(key, entry);
  }

  /*
   * registerSuccess: login certo → esquece o histórico da conta.
   */
  function registerSuccess(email) {
    accounts.delete(keyFor(email));
  }

  return { check, registerFailure, registerSuccess };
}

// Exporta uma instância pronta (usada pela API), a fábrica (para testes) e o limite de falhas.
module.exports = { ...createLoginThrottle(), createLoginThrottle, MAX_FAILURES };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   No login: check (bloqueada?) → se a senha estiver errada, registerFailure
 *   (5 falhas = bloqueio com tempo crescente) → se estiver certa, registerSuccess.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Ataques de força bruta e bloqueio progressivo (backoff exponencial).
 *   - Map como armazenamento em memória e limpeza para controlar memória.
 *   - Operador ** (potência) e Math.min.
 *   - Fábricas com relógio injetável para testar comportamentos de tempo.
 * ============================================================================
 */
