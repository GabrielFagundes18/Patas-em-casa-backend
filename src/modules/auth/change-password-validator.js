/*
 * ============================================================================
 * ARQUIVO: change-password-validator.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADOR da troca da própria senha (PATCH /api/v1/me/password). Confere só
 *   o formato: as duas senhas precisam ser texto, não vazias e com até 128
 *   caracteres. A política de senha forte é aplicada depois, no auth-service.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - validateChangePassword({ body }) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: ./auth-routes.js (via middleware validate-request).
 * ============================================================================
 */

/*
 * FUNÇÃO: validateChangePassword
 * O que faz: valida senha_atual e nova_senha do corpo.
 * Parâmetros: objeto com "body" (corpo da requisição).
 * Retorno (array): detalhes de erro ({ field, message }); vazio se ok.
 */
function validateChangePassword({ body }) {
  const details = [];

  // Senha atual: texto, não vazia, até 128 caracteres.
  if (typeof body.senha_atual !== 'string' || body.senha_atual.length === 0 || body.senha_atual.length > 128) {
    details.push({ field: 'senha_atual', message: 'Informe a senha atual.' });
  }

  // Nova senha: mesmas regras de formato.
  if (typeof body.nova_senha !== 'string' || body.nova_senha.length === 0 || body.nova_senha.length > 128) {
    details.push({ field: 'nova_senha', message: 'Informe a nova senha (até 128 caracteres).' });
  }

  return details;
}

// Exporta a função diretamente.
module.exports = validateChangePassword;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   validate-request chama esta função; se ela devolver detalhes, a API responde
 *   422 antes de chegar ao controller.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validação de formato x validação de regra de negócio.
 *   - Limitar o tamanho de entradas (evita abuso e processamento excessivo).
 * ============================================================================
 */
