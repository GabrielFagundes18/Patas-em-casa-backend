const nodemailer = require('nodemailer');
const { readConfig } = require('../../config/env');

// Envio de e-mails por SMTP (variáveis SMTP_* do .env). Sem configuração, isConfigured() é falso
// e quem chama avisa a equipe: o e-mail nunca é condição para salvar a ação no banco.
function createMailer(config = readConfig().email, { createTransport = nodemailer.createTransport } = {}) {
  let transport = null;

  function isConfigured() {
    return Boolean(config);
  }

  async function send({ to, subject, text, html }) {
    if (!config) throw new Error('SMTP não configurado.');

    transport ||= createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    await transport.sendMail({
      from: config.from,
      replyTo: config.replyTo || undefined,
      to,
      subject,
      text,
      html,
    });
  }

  return { isConfigured, send };
}

module.exports = { ...createMailer(), createMailer };
