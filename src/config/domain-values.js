// Valores aceitos pelo banco (restrições CHECK do schema em migrations/000-patas-em-casa-schema.sql).
// Validadores e regras de negócio usam somente estas listas; rótulos amigáveis ficam no frontend.
module.exports = {
  animal: {
    species: ['cachorro', 'gato', 'outro'],
    sex: ['macho', 'femea'],
    size: ['pequeno', 'medio', 'grande'],
    status: ['disponivel', 'em_processo', 'adotado', 'urgente', 'inativo'],
    publicStatus: ['disponivel', 'urgente'],
  },
  adoptionRequest: {
    status: ['novo', 'em_analise', 'visita_agendada', 'aprovado', 'reprovado'],
    openStatus: ['novo', 'em_analise', 'visita_agendada'],
    priority: ['alto', 'medio', 'baixo'],
    // Tipos de agendamento (mesmos da agenda proposta na migração 004; hoje ficam no histórico do pedido).
    appointmentTypes: ['visita', 'entrevista'],
  },
  adopter: {
    status: ['em_analise', 'visita_agendada', 'adotante', 'inativo'],
  },
  donation: {
    type: ['unica', 'recorrente'],
    method: ['pix', 'cartao', 'boleto', 'transferencia'],
    status: ['pendente', 'confirmada', 'cancelada', 'falhou'],
  },
  volunteer: {
    status: ['ativo', 'inativo'],
    areas: [
      'passeios',
      'banho_e_tosa',
      'divulgacao',
      'eventos',
      'transporte',
      'fotografia',
      'socializacao',
      'captacao',
      'manutencao',
    ],
  },
  user: {
    roles: ['administrador', 'gestor_ong', 'gestor_animais', 'financeiro', 'voluntariado'],
  },
};
