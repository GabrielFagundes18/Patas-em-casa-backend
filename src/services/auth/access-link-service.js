const { createHash, randomBytes } = require('node:crypto');
const { readConfig } = require('../../config/env');
const { roleLabels } = require('../../config/permissions');
const logger = require('../../utils/logger');
const accessLinkRepository = require('../../repositories/auth/access-link-repository');
const defaultMailer = require('../../integrations/email/mailer');
const { buildInviteEmail, buildPasswordResetEmail } = require('../../integrations/email/account-emails');

const VALIDITY_HOURS = Object.freeze({ redefinicao: 1, convite: 72 });

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

// Links de acesso enviados por e-mail: "redefinicao" (esqueci a senha) e "convite" (novo membro).
// Cada novo link invalida os anteriores do mesmo usuário; o token só existe no e-mail.
function createAccessLinkService({
  repository = accessLinkRepository,
  mailer = defaultMailer,
  config = readConfig(),
  now = () => Date.now(),
  log = logger,
} = {}) {
  async function issue(user, finalidade) {
    const token = randomBytes(32).toString('base64url');
    const validadeHoras = VALIDITY_HOURS[finalidade];
    await repository.invalidatePending(undefined, user.id);
    await repository.create(undefined, {
      usuarioId: user.id,
      tokenHash: hashToken(token),
      finalidade,
      expiraEm: new Date(now() + validadeHoras * 3600 * 1000),
    });
    const query = new URLSearchParams({ token, ...(finalidade === 'convite' ? { convite: '1' } : {}) });
    return { url: `${config.frontendUrl}/admin/redefinir-senha?${query}`, validadeHoras };
  }

  async function send(user, finalidade) {
    if (!mailer.isConfigured()) {
      return { enviado: false, motivo: 'O envio de e-mails não está configurado no servidor (SMTP).' };
    }

    const { url, validadeHoras } = await issue(user, finalidade);
    const message = finalidade === 'convite'
      ? buildInviteEmail({ nome: user.nome, cargo: roleLabels[user.cargo] || user.cargo, url, validadeHoras })
      : buildPasswordResetEmail({ nome: user.nome, url, validadeHoras });

    try {
      await mailer.send({ to: user.email, ...message });
      return { enviado: true };
    } catch (error) {
      log.error('email_acesso_falhou', { module: 'auth', entityId: user.id, code: error.code });
      return { enviado: false, motivo: 'O servidor de e-mail recusou ou não respondeu ao envio.' };
    }
  }

  // Valida o token dentro da transação do chamador e marca todos os links pendentes do usuário como usados.
  async function consume(db, token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const link = await repository.findValidForUpdate(db, hashToken(token));
    if (!link || !link.ativo) return null;
    await repository.invalidatePending(db, link.usuario_id);
    return link;
  }

  return { issue, send, consume };
}

module.exports = { ...createAccessLinkService(), createAccessLinkService, hashToken };
