/*
 * ============================================================================
 * ARQUIVO: access-link-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE (camada de regras de negócio) dos LINKS DE ACESSO por e-mail:
 *     - "redefinicao": a pessoa esqueceu a senha (link vale 1 hora);
 *     - "convite": novo membro da equipe cria a própria senha (link vale 72 horas).
 *   Gera um token aleatório, guarda só o hash dele, monta o link do site e envia
 *   o e-mail. Depois, ao usar o link, confere e "consome" o token (uso único).
 *
 * PRINCIPAIS ITENS:
 *   - VALIDITY_HOURS: validade de cada tipo de link.
 *   - hashToken(token): SHA-256 do token (exportada).
 *   - createAccessLinkService(deps): cria o service com issue, send e consume (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto, config/env (frontendUrl), config/permissions (roleLabels), utils/logger.
 *   - ./access-link-repository (banco).
 *   - integrations/email/mailer (envio) e account-emails (textos dos e-mails).
 *   - Usado por: ./auth-service.js (esqueci a senha / redefinir) e users/user-service.js (convite).
 * ============================================================================
 */

// createHash: calcula hashes (ex.: SHA-256); randomBytes: bytes aleatórios seguros.
const { createHash, randomBytes } = require('node:crypto');
// Configuração (endereço do site para montar o link).
const { readConfig } = require('../../config/env');
// Nomes amigáveis dos cargos (aparecem no e-mail de convite).
const { roleLabels } = require('../../config/permissions');
// Logs.
const logger = require('../../utils/logger');
// Acesso ao banco.
const accessLinkRepository = require('./access-link-repository');
// Enviador de e-mails.
const defaultMailer = require('../../integrations/email/mailer');
// Textos dos e-mails de convite e de redefinição.
const { buildInviteEmail, buildPasswordResetEmail } = require('../../integrations/email/account-emails');

// Validade (em horas) de cada tipo de link.
const VALIDITY_HOURS = Object.freeze({ redefinicao: 1, convite: 72 });

/*
 * FUNÇÃO: hashToken
 * O que faz: calcula o hash SHA-256 do token (é isso que fica no banco).
 * Parâmetros: token (string).
 * Retorno (Buffer): os 32 bytes do hash.
 */
function hashToken(token) {
  return createHash('sha256').update(String(token)).digest();
}

/*
 * FUNÇÃO: createAccessLinkService ("fábrica" do service)
 * O que faz: cria o service recebendo suas dependências. Nos testes, passamos versões falsas
 *   (repository, mailer, relógio "now"...) para testar sem banco e sem e-mail de verdade.
 *   Isso se chama "injeção de dependências".
 * Parâmetros (objeto, todos opcionais): repository, mailer, config, now (função que dá a hora), log.
 * Retorno (objeto): { issue, send, consume }.
 */
// Links de acesso enviados por e-mail: "redefinicao" (esqueci a senha) e "convite" (novo membro).
// Cada novo link invalida os anteriores do mesmo usuário; o token só existe no e-mail.
function createAccessLinkService({
  repository = accessLinkRepository,
  mailer = defaultMailer,
  config = readConfig(),
  now = () => Date.now(),
  log = logger,
} = {}) {
  /*
   * FUNÇÃO INTERNA: issue (async)
   * O que faz: gera um token novo, invalida os anteriores, grava o hash e monta a URL.
   * Parâmetros: user ({ id, ... }) e finalidade ('redefinicao' | 'convite').
   * Retorno: { url, validadeHoras }.
   */
  async function issue(user, finalidade) {
    // 32 bytes aleatórios em "base64url" (texto seguro para usar em URLs).
    const token = randomBytes(32).toString('base64url');
    const validadeHoras = VALIDITY_HOURS[finalidade];
    // "undefined" faz o repository usar o pool padrão (fora de transação).
    await repository.invalidatePending(undefined, user.id);
    await repository.create(undefined, {
      usuarioId: user.id,
      tokenHash: hashToken(token),
      finalidade,
      // Agora + validade em milissegundos (horas × 3600 s × 1000 ms).
      expiraEm: new Date(now() + validadeHoras * 3600 * 1000),
    });
    // URLSearchParams monta a parte "?token=...&convite=1" com a codificação correta.
    // "...(condição ? {...} : {})" adiciona convite=1 só quando for convite.
    const query = new URLSearchParams({ token, ...(finalidade === 'convite' ? { convite: '1' } : {}) });
    return { url: `${config.frontendUrl}/admin/redefinir-senha?${query}`, validadeHoras };
  }

  /*
   * FUNÇÃO INTERNA: send (async)
   * O que faz: emite o link e envia o e-mail correspondente.
   * Parâmetros: user ({ id, nome, email, cargo }) e finalidade.
   * Retorno: { enviado: true } ou { enviado: false, motivo } (nunca lança erro de envio).
   */
  async function send(user, finalidade) {
    // Sem SMTP configurado: não gera link (não adiantaria) e explica o motivo.
    if (!mailer.isConfigured()) {
      return { enviado: false, motivo: 'O envio de e-mails não está configurado no servidor (SMTP).' };
    }

    const { url, validadeHoras } = await issue(user, finalidade);
    // Escolhe o modelo de e-mail conforme a finalidade.
    const message = finalidade === 'convite'
      ? buildInviteEmail({ nome: user.nome, cargo: roleLabels[user.cargo] || user.cargo, url, validadeHoras })
      : buildPasswordResetEmail({ nome: user.nome, url, validadeHoras });

    try {
      // "...message" espalha assunto, texto e HTML do e-mail.
      await mailer.send({ to: user.email, ...message });
      return { enviado: true };
    } catch (error) {
      // Falha no servidor de e-mail: registra (sem dados pessoais) e devolve o motivo.
      log.error('email_acesso_falhou', { module: 'auth', entityId: user.id, code: error.code });
      return { enviado: false, motivo: 'O servidor de e-mail recusou ou não respondeu ao envio.' };
    }
  }

  /*
   * FUNÇÃO INTERNA: consume (async)
   * O que faz: valida o token recebido e o "gasta" (uso único).
   * Parâmetros:
   *   - db: client da transação do chamador (para a trava FOR UPDATE valer).
   *   - token (string): o token que veio no link.
   * Retorno: os dados do link/usuário, ou null se o token for inválido, expirado, usado ou de usuário inativo.
   */
  // Valida o token dentro da transação do chamador e marca todos os links pendentes do usuário como usados.
  async function consume(db, token) {
    // Formato básico (evita consultas ao banco com lixo).
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const link = await repository.findValidForUpdate(db, hashToken(token));
    if (!link || !link.ativo) return null;
    // Marca este e qualquer outro link pendente do usuário como usados.
    await repository.invalidatePending(db, link.usuario_id);
    return link;
  }

  return { issue, send, consume };
}

// Exporta: uma instância pronta (com as dependências reais, espalhada com "..."),
// a fábrica (para os testes) e a função de hash.
module.exports = { ...createAccessLinkService(), createAccessLinkService, hashToken };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   1. send(user, finalidade) → issue gera token, invalida links antigos, grava o
 *      hash com validade e monta a URL do site → envia o e-mail.
 *   2. A pessoa abre o link e envia a nova senha com o token.
 *   3. consume(db, token) busca o hash válido (travando a linha), invalida os
 *      links pendentes e devolve os dados para o auth-service trocar a senha.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Tokens de uso único com validade (fluxo de "esqueci minha senha").
 *   - Hash criptográfico (SHA-256) para guardar tokens com segurança.
 *   - Injeção de dependências e "fábricas" de services (facilita testes).
 *   - URLSearchParams, base64url e spread condicional.
 * ============================================================================
 */
