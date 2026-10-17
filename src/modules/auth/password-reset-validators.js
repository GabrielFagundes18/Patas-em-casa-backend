/*
 * ============================================================================
 * ARQUIVO: password-reset-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES do fluxo "esqueci minha senha":
 *     - validateForgotPassword: o e-mail informado tem formato válido?
 *     - validateResetPassword: o token do link e a nova senha têm formato válido?
 *
 * PRINCIPAIS FUNÇÕES:
 *   - validateForgotPassword({ body }), validateResetPassword({ body }) (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../utils/validators (EMAIL_PATTERN).
 *   - Usado por: ./auth-routes.js.
 * ============================================================================
 */

// Padrão de e-mail compartilhado.
const { EMAIL_PATTERN } = require('../../utils/validators');

/*
 * FUNÇÃO: validateForgotPassword
 * O que faz: confere o e-mail (texto, formato válido, até 150 caracteres).
 * Retorno (array): [] se ok; senão um detalhe para "email".
 */
function validateForgotPassword({ body }) {
  return typeof body.email === 'string' && EMAIL_PATTERN.test(body.email.trim()) && body.email.trim().length <= 150
    ? []
    : [{ field: 'email', message: 'Informe um e-mail válido.' }];
}

/*
 * FUNÇÃO: validateResetPassword
 * O que faz: confere o token (20 a 200 caracteres) e a nova senha (1 a 128 caracteres).
 * Retorno (array): detalhes de erro; vazio se ok.
 * Técnica: monta um array com "detalhe ou null" para cada campo e remove os nulls com filter(Boolean).
 */
function validateResetPassword({ body }) {
  return [
    typeof body.token === 'string' && body.token.length >= 20 && body.token.length <= 200
      ? null
      : { field: 'token', message: 'Link inválido. Abra novamente o link recebido por e-mail.' },
    typeof body.nova_senha === 'string' && body.nova_senha.length > 0 && body.nova_senha.length <= 128
      ? null
      : { field: 'nova_senha', message: 'Informe a nova senha (até 128 caracteres).' },
  ].filter(Boolean);
}

// Exporta as duas funções.
module.exports = { validateForgotPassword, validateResetPassword };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Nas rotas forgot-password e reset-password, validate-request chama estes
 *   validadores; formatos inválidos são recusados com 422 antes do service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Operador ternário (condição ? a : b) para montar resultados.
 *   - filter(Boolean) para remover valores "falsos" (null, undefined...) de um array.
 * ============================================================================
 */
