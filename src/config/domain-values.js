/*
 * ============================================================================
 * ARQUIVO: domain-values.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Reúne as LISTAS DE VALORES PERMITIDOS de cada campo "de escolha" do sistema
 *   (espécie, porte, status do animal, status do pedido, forma de pagamento,
 *   áreas de voluntariado, cargos...). Esses valores precisam ser IGUAIS às
 *   restrições CHECK do banco de dados: se o código aceitasse um valor que o
 *   banco recusa, a gravação falharia.
 *
 * PRINCIPAIS ITENS (objeto exportado):
 *   - animal, adoptionRequest, adopter, donation, volunteer, user.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Espelha o schema em migrations/000-patas-em-casa-schema.sql.
 *   - Usado pelos validadores (modules/*\/...-validators.js) e por regras de negócio
 *     (ex.: animal-status-rules.js, services).
 *   - Os textos amigáveis ("Disponível", "Em análise"...) ficam no frontend.
 * ============================================================================
 */

// Valores aceitos pelo banco (restrições CHECK do schema em migrations/000-patas-em-casa-schema.sql).
// Validadores e regras de negócio usam somente estas listas; rótulos amigáveis ficam no frontend.
// module.exports = { ... } exporta este objeto inteiro para quem fizer require() do arquivo.
module.exports = {
  // Animais.
  animal: {
    // Espécie.
    species: ['cachorro', 'gato', 'outro'],
    // Sexo.
    sex: ['macho', 'femea'],
    // Porte.
    size: ['pequeno', 'medio', 'grande'],
    // Situação do animal no abrigo.
    status: ['disponivel', 'em_processo', 'adotado', 'urgente', 'inativo'],
    // Situações que aparecem no site público (os demais ficam só no painel).
    publicStatus: ['disponivel', 'urgente'],
  },
  // Pedidos de adoção.
  adoptionRequest: {
    // Etapas do pedido.
    status: ['novo', 'em_analise', 'visita_agendada', 'aprovado', 'reprovado'],
    // Etapas "em aberto" (ainda sem decisão final).
    openStatus: ['novo', 'em_analise', 'visita_agendada'],
    // Prioridade de atendimento.
    priority: ['alto', 'medio', 'baixo'],
    // Tipos de agendamento (mesmos da agenda proposta na migração 004; hoje ficam no histórico do pedido).
    appointmentTypes: ['visita', 'entrevista'],
  },
  // Adotantes.
  adopter: {
    status: ['em_analise', 'visita_agendada', 'adotante', 'inativo'],
  },
  // Doações.
  donation: {
    // Única ou recorrente (mensal).
    type: ['unica', 'recorrente'],
    // Forma de pagamento.
    method: ['pix', 'cartao', 'boleto', 'transferencia'],
    // Situação do pagamento.
    status: ['pendente', 'confirmada', 'cancelada', 'falhou'],
  },
  // Voluntários.
  volunteer: {
    status: ['ativo', 'inativo'],
    // Áreas em que a pessoa pode ajudar.
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
  // Usuários do painel (equipe).
  user: {
    // Cargos (os mesmos de config/permissions.js).
    roles: ['administrador', 'gestor_ong', 'gestor_animais', 'financeiro', 'voluntariado'],
  },
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   É só um objeto de configuração: cada parte do sistema que precisa saber "quais
 *   valores são válidos" para um campo importa daqui, em vez de repetir a lista.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Enumerações (listas fechadas de valores) e restrições CHECK no banco.
 *   - "Fonte única da verdade": evitar listas duplicadas espalhadas pelo código.
 *   - Separar valores técnicos (sem acento, para o banco) de rótulos de exibição.
 * ============================================================================
 */
