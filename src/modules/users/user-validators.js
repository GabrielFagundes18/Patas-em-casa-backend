/*
 * ============================================================================
 * ARQUIVO: user-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES da EQUIPE: filtros da lista, cadastro (nome, e-mail, cargo,
 *   senha inicial OU convite, ativo), edição e redefinição de senha.
 *   (A força da senha é conferida depois, no user-service, pela política de senha.)
 *
 * PRINCIPAIS ITENS:
 *   - SORT_FIELDS.
 *   - validateListUsers, validateCreateUser, validateUpdateUser, validateResetPassword (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - config/domain-values (cargos) e utils/validators.
 *   - Usado por: ./user-routes.js.
 * ============================================================================
 */

// Cargos aceitos.
const { user } = require('../../config/domain-values');
// Validações reutilizáveis.
const {
  emailDetail,
  enumDetail,
  listQueryDetails,
  textDetail,
} = require('../../utils/validators');

// Ordenações permitidas.
const SORT_FIELDS = ['nome', 'email', 'cargo', 'criado_em'];

/*
 * FUNÇÃO: validateListUsers
 * O que faz: paginação/busca/ordenação, cargo e ativo ("true"/"false").
 */
function validateListUsers({ query }) {
  const details = listQueryDetails(query, SORT_FIELDS);
  const cargo = enumDetail(query.cargo, 'cargo', user.roles);
  if (cargo) details.push(cargo);
  if (query.ativo !== undefined && !['true', 'false'].includes(query.ativo)) {
    details.push({ field: 'ativo', message: 'Informe true ou false.' });
  }
  return details;
}

/*
 * FUNÇÃO: validateCreateUser
 * O que faz: valida o cadastro de membro (cada item do array é "detalhe ou null").
 */
function validateCreateUser({ body }) {
  return [
    // Nome obrigatório.
    textDetail(body, 'nome', { min: 2, max: 150, required: true, message: 'Informe o nome completo.' }),
    // E-mail obrigatório.
    emailDetail(body, true),
    // Cargo obrigatório e válido.
    body.cargo === undefined
      ? { field: 'cargo', message: 'Informe o cargo.' }
      : enumDetail(body.cargo, 'cargo', user.roles),
    // Senha inicial só é dispensada quando a pessoa vai criar a própria senha pelo convite.
    // Válido se: (sem senha E com convite) OU (senha em texto com 1 a 128 caracteres).
    (body.senha === undefined && body.enviar_convite === true)
      || (typeof body.senha === 'string' && body.senha.length > 0 && body.senha.length <= 128)
      ? null
      : { field: 'senha', message: 'Informe a senha inicial (até 128 caracteres) ou envie um convite por e-mail.' },
    // enviar_convite e ativo: opcionais, mas booleanos se enviados.
    body.enviar_convite === undefined || typeof body.enviar_convite === 'boolean'
      ? null
      : { field: 'enviar_convite', message: 'Informe true ou false.' },
    body.ativo === undefined || typeof body.ativo === 'boolean'
      ? null
      : { field: 'ativo', message: 'Informe true ou false.' },
  ].filter(Boolean);
}

/*
 * FUNÇÃO: validateUpdateUser
 * O que faz: valida a edição (ao menos um campo; cada campo enviado no formato certo).
 */
function validateUpdateUser({ body }) {
  if (!['nome', 'email', 'cargo', 'ativo'].some((field) => Object.hasOwn(body, field))) {
    return [{ field: 'body', message: 'Informe ao menos um campo para atualizar.' }];
  }

  return [
    textDetail(body, 'nome', { min: 2, max: 150, message: 'Informe o nome completo.' }),
    // E-mail opcional na edição (false = não obrigatório).
    emailDetail(body, false),
    enumDetail(body.cargo, 'cargo', user.roles),
    body.ativo === undefined || typeof body.ativo === 'boolean'
      ? null
      : { field: 'ativo', message: 'Informe true ou false.' },
  ].filter(Boolean);
}

/*
 * FUNÇÃO: validateResetPassword
 * O que faz: nova_senha em texto, de 1 a 128 caracteres.
 */
function validateResetPassword({ body }) {
  return typeof body.nova_senha === 'string' && body.nova_senha.length > 0 && body.nova_senha.length <= 128
    ? []
    : [{ field: 'nova_senha', message: 'Informe a nova senha (até 128 caracteres).' }];
}

// Exporta os validadores.
module.exports = { validateListUsers, validateCreateUser, validateUpdateUser, validateResetPassword };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas da equipe usam estes validadores; formatos inválidos → 422. A força
 *   da senha e as regras de negócio ficam no user-service.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validação condicional entre campos (senha OU convite).
 *   - Arrays de "detalhe ou null" + filter(Boolean).
 * ============================================================================
 */
