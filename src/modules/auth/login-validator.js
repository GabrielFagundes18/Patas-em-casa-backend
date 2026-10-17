/*
 * ============================================================================
 * ARQUIVO: login-validator.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADOR do login (POST /api/v1/auth/login): confere se o e-mail tem
 *   formato válido e se a senha foi informada (até 128 caracteres).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - validateLogin({ body }) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: ./auth-routes.js (via validate-request).
 * ============================================================================
 */

/*
 * FUNÇÃO: validateLogin
 * O que faz: valida email e password do corpo.
 * Parâmetros: { body }.
 * Retorno (array): detalhes de erro; vazio se ok.
 */
function validateLogin({ body }) {
  const details = [];

  // E-mail: texto no formato "algo@algo.algo" (mesma ideia do EMAIL_PATTERN de utils/validators).
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    details.push({ field: 'email', message: 'Informe um e-mail válido.' });
  }

  // Senha: precisa ser texto não vazio.
  if (typeof body.password !== 'string' || body.password.length === 0) {
    details.push({ field: 'password', message: 'Informe a senha.' });
  }

  // Senha longa demais (evita gastar processamento com o bcrypt em textos enormes).
  if (typeof body.password === 'string' && body.password.length > 128) {
    details.push({ field: 'password', message: 'A senha excede o tamanho permitido.' });
  }

  return details;
}

// Exporta a função.
module.exports = validateLogin;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Antes do controller de login, validate-request chama esta função; com
 *   detalhes, responde 422; sem detalhes, o login segue.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Expressões regulares para e-mail.
 *   - Limite de tamanho de senhas e custo do hash.
 * ============================================================================
 */
