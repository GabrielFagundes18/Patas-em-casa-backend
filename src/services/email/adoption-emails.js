// E-mails ao adotante sobre o pedido de adoção: agendamento, remarcação, cancelamento e decisão.
const { describeBrasiliaDateTime } = require('../../utils/brasilia-time');
const { buildEmail } = require('./layout');

const TYPE_NAMES = { visita: 'visita', entrevista: 'entrevista' };
const TYPE_TITLES = { visita: 'Visita', entrevista: 'Entrevista' };

function appointmentDetails({ dataHora, local }) {
  const { diaSemana, data, hora } = describeBrasiliaDateTime(dataHora);
  return [
    ['Data', `${diaSemana}, ${data}`],
    ['Horário', `${hora} (horário de Brasília)`],
    ...(local ? [['Local ou link', local]] : []),
  ];
}

function buildAppointmentEmail({ tipo, dataHora, local, mensagem, adotanteNome, animalNome }) {
  return buildEmail({
    subject: `${TYPE_TITLES[tipo]} agendada: adoção de ${animalNome}`,
    name: adotanteNome,
    paragraphs: [`Agendamos uma ${TYPE_NAMES[tipo]} referente ao seu pedido de adoção de ${animalNome}.`],
    details: appointmentDetails({ dataHora, local }),
    note: mensagem ? { label: 'Mensagem da equipe', text: mensagem } : undefined,
    closing: 'Se precisar remarcar, é só responder este e-mail.',
  });
}

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

// A justificativa interna da decisão não vai para o adotante; só a mensagem escrita para ele.
function buildDecisionEmail({ aprovado, mensagem, adotanteNome, animalNome }) {
  return buildEmail({
    subject: aprovado ? `Adoção aprovada: ${animalNome} vai para casa!` : `Sobre o seu pedido de adoção de ${animalNome}`,
    name: adotanteNome,
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

module.exports = {
  buildAppointmentEmail,
  buildAppointmentRescheduledEmail,
  buildAppointmentCancelledEmail,
  buildDecisionEmail,
};
