// E-mails de acesso ao painel: redefinição de senha e convite para a equipe.
const { buildEmail } = require('./layout');

function buildPasswordResetEmail({ nome, url, validadeHoras }) {
  return buildEmail({
    subject: 'Redefinição de senha do painel Patas em Casa',
    name: nome,
    paragraphs: [
      'Recebemos um pedido para redefinir a sua senha do painel administrativo.',
      `O link vale por ${validadeHoras} hora(s) e só pode ser usado uma vez.`,
    ],
    action: { label: 'Criar nova senha', url },
    closing: 'Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
  });
}

function buildInviteEmail({ nome, cargo, url, validadeHoras }) {
  return buildEmail({
    subject: 'Convite para o painel Patas em Casa',
    name: nome,
    paragraphs: [
      `Você foi convidado(a) para a equipe do painel administrativo, com o perfil ${cargo}.`,
      `Para começar, crie a sua senha pelo link abaixo. Ele vale por ${validadeHoras} horas.`,
    ],
    action: { label: 'Criar minha senha', url },
  });
}

module.exports = { buildPasswordResetEmail, buildInviteEmail };
