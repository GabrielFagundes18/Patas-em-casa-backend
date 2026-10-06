// Mascaramento de dados pessoais exibidos por padrão (LGPD): o valor completo só sai
// pelo endpoint de revelar, que exige permissão e gera auditoria.
function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${user.slice(0, Math.min(2, user.length))}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

// Mascara e-mails e telefones dentro de textos livres (ex.: observações do pedido de adoção).
function maskContactsInText(text) {
  if (!text) return text;
  return String(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (email) => maskEmail(email))
    .replace(/(?:\+\d{1,3}\s?)?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}/g, (phone) => maskPhone(phone));
}

module.exports = { maskEmail, maskPhone, maskContactsInText };
