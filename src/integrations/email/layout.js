/*
 * ============================================================================
 * ARQUIVO: layout.js (e-mails)
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define a ESTRUTURA COMUM de todos os e-mails da ONG. A partir de partes
 *   simples (assunto, nome, parágrafos, detalhes, nota, botão, encerramento)
 *   gera DUAS versões do mesmo conteúdo:
 *     - texto puro (para programas de e-mail que não mostram HTML);
 *     - HTML com estilos "inline" (o jeito mais compatível de estilizar e-mails).
 *   Todo texto colocado no HTML passa por escapeHtml, para que um nome como
 *   "<script>" não vire código dentro do e-mail.
 *
 * PRINCIPAIS ITENS:
 *   - ORGANIZATION: nome da ONG.
 *   - escapeHtml(value): troca caracteres especiais do HTML por entidades.
 *   - firstName(name): primeiro nome.
 *   - buildEmail({...}): monta { subject, text, html }.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: ./account-emails.js, ./adoption-emails.js, ./donation-emails.js.
 *   - Testado em: tests/unit/email.test.js.
 * ============================================================================
 */

// Estrutura comum dos e-mails da ONG: mesmo conteúdo em texto puro e em HTML (com valores escapados).
// Nome da ONG (assinatura dos e-mails).
const ORGANIZATION = 'Patas em Casa';

/*
 * FUNÇÃO: escapeHtml
 * O que faz: troca &, <, >, " e ' pelas "entidades" HTML equivalentes.
 * Parâmetros: value (qualquer tipo; convertido em texto).
 * Retorno (string). Ex.: '<b>' → '&lt;b&gt;'.
 * Obs.: o "&" precisa ser trocado PRIMEIRO, senão as entidades geradas depois seriam estragadas.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/*
 * FUNÇÃO: firstName
 * O que faz: pega o primeiro nome. Ex.: '  Ana Maria Souza ' → 'Ana'.
 * Detalhe: split(/\s+/) separa por um ou mais espaços.
 */
function firstName(name) {
  return String(name).trim().split(/\s+/)[0];
}

/*
 * FUNÇÃO: buildEmail
 * O que faz: monta o e-mail completo nas versões texto e HTML.
 * Parâmetros (objeto):
 *   - subject (string): assunto.
 *   - name (string, opcional): nome do destinatário (para a saudação).
 *   - paragraphs (array de strings): parágrafos.
 *   - details (array de pares [rótulo, valor]): tabela de informações.
 *   - note ({ label, text }, opcional): bloco destacado.
 *   - action ({ label, url }, opcional): botão com link.
 *   - closing (string, opcional): frase final.
 * Retorno: { subject, text, html }.
 */
// paragraphs: textos corridos; details: pares [rótulo, valor]; note: bloco destacado (ex.: mensagem da equipe);
// action: { label, url } vira botão no HTML e linha com o link no texto.
function buildEmail({ subject, name, paragraphs = [], details = [], note, action, closing }) {
  // Saudação com o primeiro nome, se houver.
  const greeting = name ? `Olá, ${firstName(name)}!` : 'Olá!';

  // VERSÃO TEXTO: monta uma lista de linhas e junta com "\n" (quebra de linha).
  // '' = linha em branco. Cada bloco opcional usa "...(condição ? [linhas] : [])".
  // flatMap: cada parágrafo vira [parágrafo, linha em branco], e tudo é "achatado" numa lista só.
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

  // VERSÃO HTML: uma template string grande com o documento do e-mail.
  // - Estilos "inline" (style="...") porque muitos programas de e-mail ignoram <style> e CSS externo.
  // - Cada parte opcional usa "${condição ? `...html...` : ''}".
  // - .map(...).join(...) gera um <p> por parágrafo e uma <tr> (linha de tabela) por detalhe.
  // - role="presentation" avisa aos leitores de tela que a tabela é só de layout.
  // - Todos os textos passam por escapeHtml.
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

  // Devolve as três partes; o mailer envia texto e HTML juntos.
  return { subject, text, html };
}

// Exporta o nome da ONG e as funções.
module.exports = { ORGANIZATION, buildEmail, escapeHtml, firstName };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Os arquivos de e-mail chamam buildEmail com as partes do conteúdo. A função
 *   gera a versão texto (linhas unidas com "\n") e a versão HTML (template
 *   string com estilos inline e tudo escapado) e devolve { subject, text, html }.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Escapar HTML para evitar injeção de código (XSS) em e-mails.
 *   - E-mails "multipart": texto puro + HTML.
 *   - Estilos inline e tabelas de layout em e-mails.
 *   - Template strings aninhadas, map/join e flatMap.
 * ============================================================================
 */
