/*
 * ============================================================================
 * ARQUIVO: adoption-emails.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Monta o CONTEÚDO dos e-mails enviados ao ADOTANTE sobre o pedido de adoção:
 *     - visita/entrevista agendada;
 *     - remarcada;
 *     - cancelada;
 *     - decisão (aprovado ou não aprovado).
 *
 * PRINCIPAIS ITENS:
 *   - TYPE_NAMES / TYPE_TITLES: nome do tipo de agendamento no meio e no início da frase.
 *   - appointmentDetails(...): linhas "Data", "Horário", "Local" (interna).
 *   - buildAppointmentEmail, buildAppointmentRescheduledEmail,
 *     buildAppointmentCancelledEmail, buildDecisionEmail (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../../utils/brasilia-time (describeBrasiliaDateTime) e ./layout (buildEmail).
 *   - Usado por: modules/adoptions/adoption-triage-service.js.
 * ============================================================================
 */

// E-mails ao adotante sobre o pedido de adoção: agendamento, remarcação, cancelamento e decisão.
// Converte "AAAA-MM-DDTHH:mm" em dia da semana, data e hora.
const { describeBrasiliaDateTime } = require('../../utils/brasilia-time');
// Estrutura comum de e-mail.
const { buildEmail } = require('./layout');

// Nome do tipo no meio da frase ("uma visita") e no início ("Visita agendada").
const TYPE_NAMES = { visita: 'visita', entrevista: 'entrevista' };
const TYPE_TITLES = { visita: 'Visita', entrevista: 'Entrevista' };

/*
 * FUNÇÃO: appointmentDetails (interna)
 * O que faz: monta as linhas de detalhes do agendamento.
 * Parâmetros: { dataHora ("AAAA-MM-DDTHH:mm"), local (opcional) }.
 * Retorno (array de pares [rótulo, valor]).
 */
function appointmentDetails({ dataHora, local }) {
  const { diaSemana, data, hora } = describeBrasiliaDateTime(dataHora);
  return [
    ['Data', `${diaSemana}, ${data}`],
    ['Horário', `${hora} (horário de Brasília)`],
    // Linha do local só se ele foi informado.
    ...(local ? [['Local ou link', local]] : []),
  ];
}

/*
 * FUNÇÃO: buildAppointmentEmail
 * O que faz: e-mail de visita/entrevista AGENDADA.
 * Parâmetros (objeto): tipo ('visita'|'entrevista'), dataHora, local, mensagem (opcional),
 *   adotanteNome, animalNome.
 * Retorno: { subject, text, html }.
 */
function buildAppointmentEmail({ tipo, dataHora, local, mensagem, adotanteNome, animalNome }) {
  return buildEmail({
    subject: `${TYPE_TITLES[tipo]} agendada: adoção de ${animalNome}`,
    name: adotanteNome,
    paragraphs: [`Agendamos uma ${TYPE_NAMES[tipo]} referente ao seu pedido de adoção de ${animalNome}.`],
    details: appointmentDetails({ dataHora, local }),
    // Bloco destacado só quando a equipe escreveu uma mensagem.
    note: mensagem ? { label: 'Mensagem da equipe', text: mensagem } : undefined,
    closing: 'Se precisar remarcar, é só responder este e-mail.',
  });
}

/*
 * FUNÇÃO: buildAppointmentRescheduledEmail
 * O que faz: e-mail de visita/entrevista REMARCADA (com o novo horário).
 */
function buildAppointmentRescheduledEmail({ tipo, dataHora, local, mensagem, adotanteNome, animalNome }) {
  return buildEmail({
    subject: `${TYPE_TITLES[tipo]} remarcada: adoção de ${animalNome}`,
    name: adotanteNome,
    paragraphs: [`A ${TYPE_NAMES[tipo]} do seu pedido de adoção de ${animalNome} foi remarcada. Confira o novo horário:`],
    details: appointmentDetails({ dataHora, local }),
    note: mensagem ? { label: 'Mensagem da equipe', text: mensagem } : undefined,
    closing: 'Se o novo horário não for possível, é só responder este e-mail.',
  });
}

/*
 * FUNÇÃO: buildAppointmentCancelledEmail
 * O que faz: e-mail de visita/entrevista CANCELADA.
 * Parâmetros: tipo, dataHora (do compromisso cancelado), motivo (opcional), adotanteNome, animalNome.
 */
function buildAppointmentCancelledEmail({ tipo, dataHora, motivo, adotanteNome, animalNome }) {
  const { data, hora } = describeBrasiliaDateTime(dataHora);
  return buildEmail({
    subject: `${TYPE_TITLES[tipo]} cancelada: adoção de ${animalNome}`,
    name: adotanteNome,
    paragraphs: [`A ${TYPE_NAMES[tipo]} marcada para ${data} às ${hora}, referente ao seu pedido de adoção de ${animalNome}, foi cancelada.`],
    note: motivo ? { label: 'Mensagem da equipe', text: motivo } : undefined,
    closing: 'Entraremos em contato se for preciso marcar um novo horário. Dúvidas? É só responder este e-mail.',
  });
}

/*
 * FUNÇÃO: buildDecisionEmail
 * O que faz: e-mail com a DECISÃO do pedido (aprovado ou não).
 * Parâmetros: aprovado (boolean), mensagem (opcional, escrita para o adotante), adotanteNome, animalNome.
 * Retorno: { subject, text, html } — assunto e parágrafos mudam conforme "aprovado".
 */
// A justificativa interna da decisão não vai para o adotante; só a mensagem escrita para ele.
function buildDecisionEmail({ aprovado, mensagem, adotanteNome, animalNome }) {
  return buildEmail({
    subject: aprovado ? `Adoção aprovada: ${animalNome} vai para casa!` : `Sobre o seu pedido de adoção de ${animalNome}`,
    name: adotanteNome,
    // Operador ternário escolhendo entre dois arrays de parágrafos.
    paragraphs: aprovado
      ? [
        `Que alegria: o seu pedido de adoção de ${animalNome} foi aprovado!`,
        'A equipe vai entrar em contato para combinar a entrega e a assinatura do Termo de Adoção.',
      ]
      : [
        `Agradecemos muito o seu interesse em adotar ${animalNome}. Depois da análise, o pedido não pôde ser aprovado desta vez.`,
        'Outros animais continuam esperando um lar, e você pode enviar um novo pedido quando quiser.',
      ],
    note: mensagem ? { label: 'Mensagem da equipe', text: mensagem } : undefined,
    closing: 'Dúvidas? É só responder este e-mail.',
  });
}

// Exporta as quatro funções públicas.
module.exports = {
  buildAppointmentEmail,
  buildAppointmentRescheduledEmail,
  buildAppointmentCancelledEmail,
  buildDecisionEmail,
};

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O service da triagem agenda/remarca/cancela/decide e chama a função de e-mail
 *   correspondente. Cada função usa buildEmail com assunto, saudação, parágrafos,
 *   detalhes (data, horário, local) e, se houver, a mensagem da equipe.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Mensagens transacionais (e-mails disparados por ações do sistema).
 *   - Separar informação interna (justificativa) da externa (mensagem ao adotante).
 *   - Spread condicional em arrays e operador ternário.
 * ============================================================================
 */
