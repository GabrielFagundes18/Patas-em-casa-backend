/*
 * ============================================================================
 * ARQUIVO: donation-emails.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Monta o CONTEÚDO dos e-mails para quem faz DOAÇÃO MENSAL:
 *     - confirmação de que a doação mensal está ativa (com link para cancelar);
 *     - e-mail com os links de cancelamento, quando a pessoa pede pelo site.
 *
 * PRINCIPAIS ITENS:
 *   - currency: formatador de moeda em reais (R$).
 *   - buildSubscriptionActiveEmail({ nome, valor, cancelUrl }).
 *   - buildCancelLinkEmail({ nome, links }).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./layout (buildEmail).
 *   - Usado por: modules/donations/online-donation-service.js.
 * ============================================================================
 */

// E-mails ao doador da doação mensal: confirmação (com link de cancelamento) e link pedido pelo site.
// Estrutura comum de e-mail.
const { buildEmail } = require('./layout');

// Formata números como dinheiro brasileiro: 25 → "R$ 25,00".
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/*
 * FUNÇÃO: buildSubscriptionActiveEmail
 * O que faz: e-mail de confirmação da doação mensal.
 * Parâmetros: nome (string), valor (number), cancelUrl (link para cancelar).
 * Retorno: { subject, text, html }.
 */
function buildSubscriptionActiveEmail({ nome, valor, cancelUrl }) {
  return buildEmail({
    subject: 'Sua doação mensal para a Patas em Casa está ativa',
    name: nome,
    paragraphs: [
      `Obrigado por apoiar os animais todos os meses! Sua doação mensal de ${currency.format(valor)} foi confirmada pelo Mercado Pago.`,
      'A cobrança é feita pelo Mercado Pago, no meio de pagamento que você escolheu.',
    ],
    action: { label: 'Cancelar a doação mensal', url: cancelUrl },
    closing: 'Guarde este e-mail: o link acima cancela a doação a qualquer momento (ele vale por 7 dias; depois, peça um novo no site).',
  });
}

/*
 * FUNÇÃO: buildCancelLinkEmail
 * O que faz: e-mail com um link de cancelamento para cada doação mensal ativa do e-mail.
 * Parâmetros: nome (string) e links (array de { valor, url }).
 * Retorno: { subject, text, html }.
 */
function buildCancelLinkEmail({ nome, links }) {
  return buildEmail({
    subject: 'Link para cancelar sua doação mensal',
    name: nome,
    paragraphs: ['Recebemos um pedido para cancelar a doação mensal feita com este e-mail.'],
    // Uma linha por doação: ["Doação de R$ 25,00/mês", "https://..."].
    details: links.map(({ valor, url }) => [`Doação de ${currency.format(valor)}/mês`, url]),
    closing: 'Abra o link da doação que deseja cancelar (vale por 7 dias). Se não foi você, ignore este e-mail.',
  });
}

// Exporta as duas funções.
module.exports = { buildSubscriptionActiveEmail, buildCancelLinkEmail };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Quando o Mercado Pago confirma uma assinatura, o service envia o e-mail de
 *   "doação ativa". Quando a pessoa pede o cancelamento no site, recebe um
 *   e-mail com um link (válido por 7 dias) para cada doação mensal.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Intl.NumberFormat para formatar moeda.
 *   - Links de ação com prazo de validade enviados por e-mail.
 * ============================================================================
 */
