/*
 * ============================================================================
 * ARQUIVO: account-emails.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Monta o CONTEÚDO dos e-mails de ACESSO AO PAINEL:
 *     - redefinição de senha ("esqueci minha senha");
 *     - convite para um novo membro da equipe criar a própria senha.
 *   Não envia nada: só devolve { subject, text, html } para o mailer enviar.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - buildPasswordResetEmail({ nome, url, validadeHoras }).
 *   - buildInviteEmail({ nome, cargo, url, validadeHoras }).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./layout (buildEmail: estrutura visual comum).
 *   - Usado por: modules/auth/access-link-service.js.
 * ============================================================================
 */

// E-mails de acesso ao painel: redefinição de senha e convite para a equipe.
// Estrutura comum de e-mail (texto + HTML).
const { buildEmail } = require('./layout');

/*
 * FUNÇÃO: buildPasswordResetEmail
 * O que faz: monta o e-mail com o link para criar uma nova senha.
 * Parâmetros (objeto): nome (string), url (string do link), validadeHoras (number).
 * Retorno: { subject, text, html }.
 */
function buildPasswordResetEmail({ nome, url, validadeHoras }) {
  return buildEmail({
    // Assunto.
    subject: 'Redefinição de senha do painel Patas em Casa',
    // Nome para a saudação ("Olá, Ana!").
    name: nome,
    // Parágrafos do corpo.
    paragraphs: [
      'Recebemos um pedido para redefinir a sua senha do painel administrativo.',
      `O link vale por ${validadeHoras} hora(s) e só pode ser usado uma vez.`,
    ],
    // Botão com o link.
    action: { label: 'Criar nova senha', url },
    // Frase de encerramento.
    closing: 'Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
  });
}

/*
 * FUNÇÃO: buildInviteEmail
 * O que faz: monta o convite para um novo membro da equipe.
 * Parâmetros (objeto): nome, cargo (nome amigável do cargo), url, validadeHoras.
 * Retorno: { subject, text, html }.
 */
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

// Exporta as duas funções.
module.exports = { buildPasswordResetEmail, buildInviteEmail };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O access-link-service gera o link e chama uma destas funções; o resultado
 *   (assunto, texto e HTML) vai para mailer.send().
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Separar o CONTEÚDO do e-mail do ENVIO (mais fácil de testar e mudar).
 *   - Template strings com variáveis (${...}).
 * ============================================================================
 */
