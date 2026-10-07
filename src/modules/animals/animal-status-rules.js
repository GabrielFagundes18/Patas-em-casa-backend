const AppError = require('../../utils/app-error');

// Máquina de estados do animal: de cada status, para quais ele pode ir manualmente.
// "adotado" normalmente é definido pela aprovação do pedido de adoção (módulo de adoções).
const TRANSITIONS = Object.freeze({
  disponivel: ['urgente', 'em_processo', 'inativo'],
  urgente: ['disponivel', 'em_processo', 'inativo'],
  em_processo: ['disponivel', 'urgente', 'adotado', 'inativo'],
  adotado: ['disponivel'],
  inativo: ['disponivel', 'urgente'],
});

// Mudanças manuais que só o administrador pode fazer: adoção fora do fluxo de pedidos e devolução.
const ADMIN_ONLY = new Set(['em_processo>adotado', 'adotado>disponivel']);

function requiresReason(from, to) {
  return to === 'inativo' || (from === 'adotado' && to === 'disponivel');
}

function assertStatusTransition({ from, to, role, motivo }) {
  if (from === to) return;

  if (from === null) {
    if (to === 'adotado' && role !== 'administrador') {
      throw new AppError(403, 'TRANSICAO_NAO_PERMITIDA', 'Somente administradores podem cadastrar um animal já adotado.');
    }
    return;
  }

  if (!TRANSITIONS[from]?.includes(to)) {
    throw new AppError(409, 'TRANSICAO_INVALIDA', `Não é possível mudar o status de "${from}" para "${to}".`, [
      { field: 'status', message: `A partir de "${from}", os status permitidos são: ${TRANSITIONS[from]?.join(', ') || 'nenhum'}.` },
    ]);
  }

  if (ADMIN_ONLY.has(`${from}>${to}`) && role !== 'administrador') {
    throw new AppError(403, 'TRANSICAO_NAO_PERMITIDA', 'Somente administradores podem fazer esta mudança de status.');
  }

  if (requiresReason(from, to) && !(typeof motivo === 'string' && motivo.trim().length >= 5)) {
    throw new AppError(422, 'MOTIVO_OBRIGATORIO', 'Informe o motivo desta mudança de status.', [
      { field: 'motivo', message: 'Descreva o motivo (mínimo de 5 caracteres).' },
    ]);
  }
}

module.exports = { assertStatusTransition };
