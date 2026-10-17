/*
 * ============================================================================
 * ARQUIVO: rate-limit.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   LIMITA A QUANTIDADE DE REQUISIÇÕES que um mesmo visitante (normalmente
 *   identificado pelo IP) pode fazer num intervalo de tempo. Protege a API
 *   contra abuso: robôs, tentativas de adivinhar senhas, excesso de formulários.
 *   Quem passa do limite recebe 429 ("Muitas solicitações").
 *
 * PRINCIPAIS FUNÇÕES:
 *   - rateLimit({ windowMs, max, keyFn }): cria o middleware (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../utils/app-error.
 *   - Usado por: src/app.js (limite geral) e rotas sensíveis (login, formulários públicos...).
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../utils/app-error');

/*
 * FUNÇÃO: rateLimit
 * O que faz: cria um middleware de limite por "janela fixa" de tempo.
 * Parâmetros (objeto desestruturado):
 *   - windowMs (number): duração da janela em milissegundos (ex.: 5 min = 300000).
 *   - max (number): máximo de requisições por janela.
 *   - keyFn (função, opcional): como identificar o visitante. Padrão: o IP (req.ip).
 * Retorno (função middleware).
 * Detalhe: os contadores ficam na memória desta instância da API (se houver várias instâncias,
 *   cada uma conta separado; se a API reiniciar, os contadores zeram).
 */
// Limite de requisições por janela fixa, em memória (uma instância da API).
// Atrás de proxy, configure TRUST_PROXY para que req.ip seja o IP real do cliente.
function rateLimit({ windowMs, max, keyFn = (req) => req.ip || 'desconhecido' }) {
  // Map: chave (IP) → { count: requisições na janela, resetAt: quando a janela termina }.
  const hits = new Map();
  // Última vez que limpamos as entradas vencidas.
  let lastSweep = Date.now();

  // O middleware em si. Ele "enxerga" hits e lastSweep (closure), que persistem entre requisições.
  return function rateLimitMiddleware(req, res, next) {
    // Momento atual em milissegundos.
    const now = Date.now();

    // Limpeza periódica (no máximo uma vez por janela): remove contadores vencidos,
    // para o Map não crescer sem parar.
    if (now - lastSweep > windowMs) {
      // for...of em um Map percorre pares [chave, valor].
      for (const [key, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(key);
      }
      lastSweep = now;
    }

    // Identifica o visitante e busca o contador dele.
    const key = keyFn(req);
    let entry = hits.get(key);
    // Primeira requisição ou janela vencida: começa um contador novo.
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    // Conta esta requisição.
    entry.count += 1;
    // Cabeçalhos informativos: limite e quantas ainda restam (nunca negativo, por isso Math.max).
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    // Passou do limite: informa em quantos segundos pode tentar de novo e responde 429.
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError(429, 'MUITAS_REQUISICOES', 'Muitas solicitações em pouco tempo. Tente novamente mais tarde.'));
    }

    // Dentro do limite: segue.
    return next();
  };
}

// Exporta a fábrica de middleware.
module.exports = rateLimit;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   rateLimit({ windowMs, max }) cria um contador por visitante. A cada
 *   requisição: limpa vencidos (de vez em quando), soma 1, informa os cabeçalhos
 *   RateLimit-* e, se passou de "max", responde 429 com Retry-After.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Rate limiting (janela fixa x janela deslizante x token bucket).
 *   - Map, for...of e closures que guardam estado entre chamadas.
 *   - Status 429 e os cabeçalhos Retry-After / RateLimit-*.
 *   - req.ip, proxies e a configuração "trust proxy".
 * ============================================================================
 */
