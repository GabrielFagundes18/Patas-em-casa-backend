/*
 * ============================================================================
 * ARQUIVO: mailer.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   ENVIA os e-mails por SMTP (o protocolo de envio de e-mails), usando a
 *   biblioteca nodemailer e as variáveis SMTP_* do .env. Se o SMTP não estiver
 *   configurado, isConfigured() devolve false e quem chama avisa a equipe que o
 *   e-mail não saiu — a ação principal (salvar no banco) acontece mesmo assim.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - createMailer(config, { createTransport }): cria o enviador com isConfigured e send (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - nodemailer e ../../config/env (configuração de e-mail).
 *   - Usado por: auth/access-link-service, adoptions/adoption-triage-service,
 *     donations/online-donation-service.
 * ============================================================================
 */

// Biblioteca de envio de e-mails.
const nodemailer = require('nodemailer');
// Configuração.
const { readConfig } = require('../../config/env');

/*
 * FUNÇÃO: createMailer (fábrica)
 * Parâmetros:
 *   - config (objeto | null): configuração de e-mail (padrão: readConfig().email).
 *   - { createTransport } (opcional): função que cria a conexão SMTP (os testes passam uma falsa).
 * Retorno: { isConfigured, send }.
 */
// Envio de e-mails por SMTP (variáveis SMTP_* do .env). Sem configuração, isConfigured() é falso
// e quem chama avisa a equipe: o e-mail nunca é condição para salvar a ação no banco.
function createMailer(config = readConfig().email, { createTransport = nodemailer.createTransport } = {}) {
  // A conexão SMTP só é criada no primeiro envio ("criação preguiçosa" / lazy).
  let transport = null;

  // Há configuração de SMTP? Boolean() converte para true/false.
  function isConfigured() {
    return Boolean(config);
  }

  /*
   * FUNÇÃO INTERNA: send (async)
   * O que faz: envia um e-mail.
   * Parâmetros: { to (destinatário), subject, text, html }.
   * Retorno: nada. Lança erro se o SMTP não estiver configurado ou se o envio falhar.
   */
  async function send({ to, subject, text, html }) {
    if (!config) throw new Error('SMTP não configurado.');

    // "||=" cria o transporte só se ainda não existir; depois ele é reutilizado.
    transport ||= createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Autenticação só se houver usuário configurado.
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      // Tempos limite (ms) para conectar, receber a saudação do servidor e esperar dados.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    // Envia a mensagem com remetente e (opcionalmente) endereço de resposta.
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

// Exporta uma instância pronta (com a configuração real) e a fábrica.
module.exports = { ...createMailer(), createMailer };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Os services perguntam isConfigured(); se sim, montam o conteúdo e chamam
 *   send(), que cria (uma vez) a conexão SMTP e envia texto + HTML.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - SMTP e a biblioteca nodemailer (transport, sendMail).
 *   - Inicialização preguiçosa (lazy) com ||=.
 *   - Funcionalidades opcionais que não bloqueiam a operação principal.
 *   - Injeção de dependência para testar sem enviar e-mails reais.
 * ============================================================================
 */
