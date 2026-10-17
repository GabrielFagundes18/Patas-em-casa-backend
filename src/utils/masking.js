/*
 * ============================================================================
 * ARQUIVO: masking.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   MASCARA dados pessoais (e-mail e telefone) para que o painel mostre só uma
 *   parte deles por padrão (ex.: "an***@email.com", "*******4321"). Quem precisa
 *   ver o dado completo usa a ação "revelar", que exige permissão e fica
 *   registrada na auditoria (LGPD).
 *
 * PRINCIPAIS FUNÇÕES:
 *   - maskEmail(email), maskPhone(phone), maskContactsInText(text).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: services de adotantes, pedidos de adoção, doações e voluntários.
 * ============================================================================
 */

// Mascaramento de dados pessoais exibidos por padrão (LGPD): o valor completo só sai
// pelo endpoint de revelar, que exige permissão e gera auditoria.

/*
 * FUNÇÃO: maskEmail
 * O que faz: mostra só os 2 primeiros caracteres do usuário e o domínio.
 * Parâmetros: email (string | null).
 * Retorno: null se vazio; '***' se não tiver "@"; senão ex.: 'ana@x.org' → 'an***@x.org'.
 */
function maskEmail(email) {
  if (!email) return null;
  // Separa no "@": user = antes, domain = depois.
  const [user, domain] = String(email).split('@');
  // Sem domínio (texto estranho): esconde tudo.
  if (!domain) return '***';
  // Math.min evita pegar mais caracteres do que o usuário tem (ex.: e-mail "a@x.org").
  return `${user.slice(0, Math.min(2, user.length))}***@${domain}`;
}

/*
 * FUNÇÃO: maskPhone
 * O que faz: troca todos os dígitos por "*", menos os 4 últimos.
 * Parâmetros: phone (string | null).
 * Retorno: null se vazio; '****' se tiver até 4 dígitos; senão ex.: '(11) 98765-4321' → '*******4321'.
 */
function maskPhone(phone) {
  if (!phone) return null;
  // \D = qualquer coisa que NÃO seja dígito; "g" = todas as ocorrências. Fica só com os números.
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  // '*'.repeat(n) repete o asterisco n vezes; slice(-4) pega os 4 últimos dígitos.
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/*
 * FUNÇÃO: maskContactsInText
 * O que faz: procura e-mails e telefones dentro de um texto livre e os mascara.
 * Parâmetros: text (string | null).
 * Retorno: o texto com os contatos mascarados (ou o próprio valor, se vazio).
 */
// Mascara e-mails e telefones dentro de textos livres (ex.: observações do pedido de adoção).
function maskContactsInText(text) {
  if (!text) return text;
  return String(text)
    // E-mails: letras/números/._+- antes do "@", depois domínio com um ou mais ".parte".
    // O 2º argumento de replace pode ser uma função: ela recebe o trecho encontrado e devolve o substituto.
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (email) => maskEmail(email))
    // Telefones: código do país opcional (+55), DDD com ou sem parênteses, 4 ou 5 dígitos, separador opcional, 4 dígitos.
    .replace(/(?:\+\d{1,3}\s?)?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/g, (phone) => maskPhone(phone));
}

// Exporta as três funções.
module.exports = { maskEmail, maskPhone, maskContactsInText };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Antes de enviar dados ao painel, os services passam e-mails e telefones por
 *   maskEmail/maskPhone, e textos livres por maskContactsInText. O valor completo
 *   só é devolvido pela rota de "revelar", com permissão e auditoria.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - LGPD: minimização e mascaramento de dados pessoais.
 *   - Expressões regulares: \w, \d, \D, \s, quantificadores {n,m}, grupos (?:...) e a flag g.
 *   - String.replace com função de substituição.
 *   - slice, repeat e split em strings.
 * ============================================================================
 */
