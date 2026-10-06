const assert = require('node:assert/strict');
const test = require('node:test');
const { readConfig } = require('../src/config/env');
const { createMailer } = require('../src/services/email/mailer');
const { validateSchedule } = require('../src/validators/adoptions/adoption-triage-validators');

test('SMTP is optional and derives TLS and sender from the other variables', () => {
  assert.equal(readConfig({}).email, null);
  assert.deepEqual(readConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'ong@gmail.com', SMTP_PASS: 'app-pass' }).email, {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'ong@gmail.com',
    pass: 'app-pass',
    from: 'ong@gmail.com',
    replyTo: '',
  });
  assert.equal(readConfig({ SMTP_HOST: 'smtp.example', SMTP_PORT: '465', EMAIL_FROM: 'a@b.org' }).email.secure, true);
  assert.throws(() => readConfig({ SMTP_HOST: 'smtp.example' }), /EMAIL_FROM/);
  assert.throws(() => readConfig({ SMTP_HOST: 'smtp.example', EMAIL_FROM: 'a@b.org', SMTP_SECURE: 'sim' }), /SMTP_SECURE/);
});

test('the mailer sends through one reused SMTP transport', async () => {
  const transports = [];
  const config = readConfig({ SMTP_HOST: 'smtp.example', SMTP_USER: 'ong@example.org', SMTP_PASS: 'x', EMAIL_REPLY_TO: 'contato@example.org' }).email;
  const mailer = createMailer(config, {
    createTransport: (options) => {
      const transport = { options, sent: [], sendMail: async (message) => transport.sent.push(message) };
      transports.push(transport);
      return transport;
    },
  });

  await mailer.send({ to: 'ana@example.org', subject: 'Oi', text: 'a', html: '<p>a</p>' });
  await mailer.send({ to: 'bia@example.org', subject: 'Oi', text: 'b', html: '<p>b</p>' });

  assert.equal(mailer.isConfigured(), true);
  assert.equal(transports.length, 1);
  assert.deepEqual(transports[0].options.auth, { user: 'ong@example.org', pass: 'x' });
  assert.equal(transports[0].sent[1].from, 'ong@example.org');
  assert.equal(transports[0].sent[1].replyTo, 'contato@example.org');
  assert.equal(createMailer(null).isConfigured(), false);
  await assert.rejects(createMailer(null).send({ to: 'x@example.org' }), /SMTP/);
});

test('schedule payloads need a type and a real date and time', () => {
  assert.deepEqual(validateSchedule({ body: { tipo: 'visita', data_hora: '2026-10-10T14:00', local: '', enviar_email: true } }), []);
  assert.deepEqual(
    validateSchedule({ body: { tipo: 'reuniao', data_hora: '2026-02-30T14:00', enviar_email: 'sim' } }).map((detail) => detail.field),
    ['tipo', 'data_hora', 'enviar_email']
  );
  assert.deepEqual(
    validateSchedule({ body: { data_hora: '2026-10-10 14:00', mensagem: 'x'.repeat(1001) } }).map((detail) => detail.field),
    ['tipo', 'data_hora', 'mensagem']
  );
});
