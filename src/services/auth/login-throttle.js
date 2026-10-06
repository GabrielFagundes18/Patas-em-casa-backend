const MAX_FAILURES = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 4 * 60 * 60 * 1000;
const MAX_TRACKED_ACCOUNTS = 10000;

// Bloqueio por conta após falhas seguidas, com tempo crescente (15 min, 30 min, 1 h... até 4 h).
// A chave é o e-mail digitado, exista ou não, para não revelar quais contas existem.
function createLoginThrottle({ now = () => Date.now() } = {}) {
  const accounts = new Map();

  const keyFor = (email) => String(email).trim().toLowerCase();

  function check(email) {
    const entry = accounts.get(keyFor(email));
    if (entry && entry.lockedUntil > now()) {
      return { locked: true, retryAfterMs: entry.lockedUntil - now() };
    }
    return { locked: false, retryAfterMs: 0 };
  }

  function registerFailure(email) {
    if (accounts.size > MAX_TRACKED_ACCOUNTS) {
      for (const [key, entry] of accounts) {
        if (entry.lockedUntil <= now()) accounts.delete(key);
      }
    }

    const key = keyFor(email);
    const entry = accounts.get(key) || { failures: 0, locks: 0, lockedUntil: 0 };
    entry.failures += 1;

    if (entry.failures >= MAX_FAILURES) {
      entry.locks += 1;
      entry.failures = 0;
      entry.lockedUntil = now() + Math.min(BASE_LOCK_MS * 2 ** (entry.locks - 1), MAX_LOCK_MS);
    }

    accounts.set(key, entry);
  }

  function registerSuccess(email) {
    accounts.delete(keyFor(email));
  }

  return { check, registerFailure, registerSuccess };
}

module.exports = { ...createLoginThrottle(), createLoginThrottle, MAX_FAILURES };
