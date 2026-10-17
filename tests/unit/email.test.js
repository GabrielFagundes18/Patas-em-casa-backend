/*
 * ============================================================================
 * ARQUIVO: email.test.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   TESTES do ENVIO DE E-MAIL e da validação de agendamento: configuração SMTP
 *   opcional (com TLS e remetente deduzidos), reaproveitamento de uma única
 *   conexão SMTP e regras do corpo de agendamento.
 *
 * PRINCIPAIS ITENS:
 *   - 3 testes.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - src/config/env (readConfig), src/integrations/email/mailer (createMailer),
 *     src/modules/adoptions/adoption-triage-validators (validateSchedule).
 * ============================================================================
 */

// Verificações.
const assert = require('node:assert/strict');
// Executor de testes.
const test = require('node:test');
// Itens testados.
const { readConfig } = require('../../src/config/env');
const { createMailer } = require('../../src/integrations/email/mailer');
const { validateSchedule } = require('../../src/modules/adoptions/adoption-triage-validators');

// Teste 1: sem SMTP_HOST → email null; com ele → porta 587, TLS deduzido pela porta, remetente = usuário; erros de configuração.
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
  // Porta 465 → TLS direto (secure: true).
  assert.equal(readConfig({ SMTP_HOST: 'smtp.example', SMTP_PORT: '465', EMAIL_FROM: 'a@b.org' }).email.secure, true);
  // Sem remetente → erro citando EMAIL_FROM; SMTP_SECURE inválido → erro.
  assert.throws(() => readConfig({ SMTP_HOST: 'smtp.example' }), /EMAIL_FROM/);
  assert.throws(() => readConfig({ SMTP_HOST: 'smtp.example', EMAIL_FROM: 'a@b.org', SMTP_SECURE: 'sim' }), /SMTP_SECURE/);
});

// Teste 2: dois envios usam UMA conexão; autenticação, remetente e responder-para corretos; sem config não envia.
test('the mailer sends through one reused SMTP transport', async () => {
  const transports = [];
  const config = readConfig({ SMTP_HOST: 'smtp.example', SMTP_USER: 'ong@example.org', SMTP_PASS: 'x', EMAIL_REPLY_TO: 'contato@example.org' }).email;
  // createTransport falso: guarda as opções e as mensagens "enviadas".
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

// Teste 3: agendamento válido passa; tipo inválido, data impossível (30/02), booleano em texto e mensagem longa são acusados.
test('schedule payloads need a type and a real date and time', () => {
  assert.deepEqual(validateSchedule({ body: { tipo: 'visita', data_hora: '2026-10-10T14:00', local: '', enviar_email: true } }), []);
  assert.deepEqual(
    validateSchedule({ body: { tipo: 'reuniao', data_hora: '2026-02-30T14:00', enviar_email: 'sim' } }).map((detail) => detail.field),
    ['tipo', 'data_hora', 'enviar_email']
  );
  // Sem tipo e data com espaço no lugar do "T".
  assert.deepEqual(
    validateSchedule({ body: { data_hora: '2026-10-10 14:00', mensagem: 'x'.repeat(1001) } }).map((detail) => detail.field),
    ['tipo', 'data_hora', 'mensagem']
  );
});

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   readConfig é chamado com objetos de ambiente "de mentira"; o mailer recebe
 *   um createTransport falso que registra o que seria enviado.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Testar integrações externas (SMTP) sem rede, com dublês.
 *   - Configuração derivada (porta 465 → TLS) e mensagens de erro claras.
 * ============================================================================
 */
