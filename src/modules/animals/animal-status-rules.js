/*
 * ============================================================================
 * ARQUIVO: animal-status-rules.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as REGRAS DE MUDANÇA DE STATUS do animal, como uma "máquina de
 *   estados": de cada status, só é possível ir para alguns outros. Também diz
 *   quais mudanças só o administrador pode fazer e quando é obrigatório
 *   informar um motivo.
 *
 *   Status: disponivel, urgente, em_processo (adoção em andamento), adotado, inativo.
 *
 * PRINCIPAIS ITENS:
 *   - TRANSITIONS: mudanças permitidas a partir de cada status.
 *   - ADMIN_ONLY: mudanças exclusivas do administrador.
 *   - requiresReason(from, to): a mudança exige motivo? (interna)
 *   - assertStatusTransition({ from, to, role, motivo }): valida a mudança (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../utils/app-error.
 *   - Usado por: ./animal-service.js. Testado em tests/unit/animal-status-rules.test.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');

// Máquina de estados do animal: de cada status, para quais ele pode ir manualmente.
// "adotado" normalmente é definido pela aprovação do pedido de adoção (módulo de adoções).
const TRANSITIONS = Object.freeze({
  disponivel: ['urgente', 'em_processo', 'inativo'],
  urgente: ['disponivel', 'em_processo', 'inativo'],
  em_processo: ['disponivel', 'urgente', 'adotado', 'inativo'],
  // Animal adotado só volta para "disponível" (devolução).
  adotado: ['disponivel'],
  inativo: ['disponivel', 'urgente'],
});

// Mudanças manuais que só o administrador pode fazer: adoção fora do fluxo de pedidos e devolução.
// O formato "de>para" junta os dois status num texto só, fácil de procurar no Set.
const ADMIN_ONLY = new Set(['em_processo>adotado', 'adotado>disponivel']);

/*
 * FUNÇÃO: requiresReason (interna)
 * O que faz: diz se a mudança exige motivo.
 * Regra: ir para "inativo", ou voltar de "adotado" para "disponível" (devolução).
 * Retorno (boolean).
 */
function requiresReason(from, to) {
  return to === 'inativo' || (from === 'adotado' && to === 'disponivel');
}

/*
 * FUNÇÃO: assertStatusTransition (exportada)
 * O que faz: confere se a mudança de status é permitida; se não for, LANÇA um erro.
 *   ("assert" = "afirmar": a função não devolve nada quando está tudo certo.)
 * Parâmetros (objeto):
 *   - from (string | null): status atual (null = animal novo, sendo cadastrado).
 *   - to (string): status desejado.
 *   - role (string): cargo de quem está mudando.
 *   - motivo (string, opcional): justificativa.
 * Erros possíveis: 403 (só administrador), 409 (transição inválida), 422 (motivo obrigatório).
 */
function assertStatusTransition({ from, to, role, motivo }) {
  // Não mudou nada: tudo certo.
  if (from === to) return;

  // Cadastro novo: qualquer status inicial vale, exceto "adotado" (só para administrador).
  if (from === null) {
    if (to === 'adotado' && role !== 'administrador') {
      throw new AppError(403, 'TRANSICAO_NAO_PERMITIDA', 'Somente administradores podem cadastrar um animal já adotado.');
    }
    return;
  }

  // A mudança precisa estar na lista de permitidas a partir do status atual.
  // 409 = Conflito (a ação conflita com o estado atual do recurso).
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new AppError(409, 'TRANSICAO_INVALIDA', `Não é possível mudar o status de "${from}" para "${to}".`, [
      { field: 'status', message: `A partir de "${from}", os status permitidos são: ${TRANSITIONS[from]?.join(', ') || 'nenhum'}.` },
    ]);
  }

  // Mudanças exclusivas do administrador.
  if (ADMIN_ONLY.has(`${from}>${to}`) && role !== 'administrador') {
    throw new AppError(403, 'TRANSICAO_NAO_PERMITIDA', 'Somente administradores podem fazer esta mudança de status.');
  }

  // Motivo obrigatório: precisa ser texto com pelo menos 5 caracteres (sem contar espaços nas pontas).
  if (requiresReason(from, to) && !(typeof motivo === 'string' && motivo.trim().length >= 5)) {
    throw new AppError(422, 'MOTIVO_OBRIGATORIO', 'Informe o motivo desta mudança de status.', [
      { field: 'motivo', message: 'Descreva o motivo (mínimo de 5 caracteres).' },
    ]);
  }
}

// Exporta só a verificação.
module.exports = { assertStatusTransition };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Antes de gravar um status novo, o animal-service chama assertStatusTransition.
 *   A função confere, em ordem: nada mudou? → cadastro novo? → transição na
 *   tabela? → exclusiva do administrador? → precisa de motivo? Qualquer falha
 *   lança um AppError e a gravação não acontece.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Máquina de estados (estados e transições permitidas).
 *   - Funções "assert" que validam lançando erros.
 *   - Status HTTP 403, 409 e 422 e quando usar cada um.
 * ============================================================================
 */
