const { describeBrasiliaDateTime } = require('../../utils/brasilia-time');

const ORGANIZATION = 'Patas em Casa';
const TYPE_NAMES = { visita: 'visita', entrevista: 'entrevista' };

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// E-mail ao adotante com data, horário, local e a mensagem da equipe (texto puro + HTML equivalente).
function buildAppointmentEmail({ tipo, dataHora, local, mensagem, adotanteNome, animalNome }) {
  const typeName = TYPE_NAMES[tipo];
  const { diaSemana, data, hora } = describeBrasiliaDateTime(dataHora);
  const firstName = String(adotanteNome).trim().split(/\s+/)[0];
  const intro = `Agendamos uma ${typeName} referente ao seu pedido de adoção de ${animalNome}.`;
  const details = [
    ['Data', `${diaSemana}, ${data}`],
    ['Horário', `${hora} (horário de Brasília)`],
    ...(local ? [['Local ou link', local]] : []),
  ];

  const text = [
    `Olá, ${firstName}!`,
    '',
    intro,
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(mensagem ? ['', 'Mensagem da equipe:', mensagem] : []),
    '',
    'Se precisar remarcar, é só responder este e-mail.',
    '',
    `Equipe ${ORGANIZATION}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f3efe6;font-family:Arial,Helvetica,sans-serif;color:#1f2a24;">
  <div style="max-width:560px;margin:0 auto;padding:28px;background:#fffaf3;border-radius:16px;">
    <p style="margin:0 0 16px;font-size:16px;">Olá, ${escapeHtml(firstName)}!</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${escapeHtml(intro)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:15px;">
      ${details.map(([label, value]) => `<tr>
        <td style="padding:8px 12px 8px 0;color:#58675f;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;font-weight:bold;">${escapeHtml(value)}</td>
      </tr>`).join('\n      ')}
    </table>
    ${mensagem ? `<p style="margin:0 0 6px;color:#58675f;font-size:14px;">Mensagem da equipe:</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;white-space:pre-line;">${escapeHtml(mensagem)}</p>` : ''}
    <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">Se precisar remarcar, é só responder este e-mail.</p>
    <p style="margin:0;font-size:14px;color:#2f5a4b;font-weight:bold;">Equipe ${ORGANIZATION}</p>
  </div>
</body>
</html>`;

  const subject = `${typeName === 'visita' ? 'Visita agendada' : 'Entrevista agendada'}: adoção de ${animalNome}`;

  return { subject, text, html };
}

module.exports = { buildAppointmentEmail };
