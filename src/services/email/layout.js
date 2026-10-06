// Estrutura comum dos e-mails da ONG: mesmo conteúdo em texto puro e em HTML (com valores escapados).
const ORGANIZATION = 'Patas em Casa';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(name) {
  return String(name).trim().split(/\s+/)[0];
}

// paragraphs: textos corridos; details: pares [rótulo, valor]; note: bloco destacado (ex.: mensagem da equipe);
// action: { label, url } vira botão no HTML e linha com o link no texto.
function buildEmail({ subject, name, paragraphs = [], details = [], note, action, closing }) {
  const greeting = name ? `Olá, ${firstName(name)}!` : 'Olá!';

  const text = [
    greeting,
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(details.length ? [...details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(note ? [`${note.label}:`, note.text, ''] : []),
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    ...(closing ? [closing, ''] : []),
    `Equipe ${ORGANIZATION}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f3efe6;font-family:Arial,Helvetica,sans-serif;color:#1f2a24;">
  <div style="max-width:560px;margin:0 auto;padding:28px;background:#fffaf3;border-radius:16px;">
    <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(greeting)}</p>
    ${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escapeHtml(paragraph)}</p>`).join('\n    ')}
    ${details.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:15px;">
      ${details.map(([label, value]) => `<tr>
        <td style="padding:8px 12px 8px 0;color:#58675f;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;font-weight:bold;">${escapeHtml(value)}</td>
      </tr>`).join('\n      ')}
    </table>` : ''}
    ${note ? `<p style="margin:0 0 6px;color:#58675f;font-size:14px;">${escapeHtml(note.label)}:</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;white-space:pre-line;">${escapeHtml(note.text)}</p>` : ''}
    ${action ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#d88b3d;color:#1f2a24;font-weight:bold;text-decoration:none;">${escapeHtml(action.label)}</a></p>
    <p style="margin:0 0 20px;font-size:12px;color:#58675f;word-break:break-all;">Se o botão não funcionar, copie este endereço: ${escapeHtml(action.url)}</p>` : ''}
    ${closing ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.5;">${escapeHtml(closing)}</p>` : ''}
    <p style="margin:0;font-size:14px;color:#2f5a4b;font-weight:bold;">Equipe ${ORGANIZATION}</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

module.exports = { ORGANIZATION, buildEmail, escapeHtml, firstName };
