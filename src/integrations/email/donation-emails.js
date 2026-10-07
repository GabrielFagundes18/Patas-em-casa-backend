// E-mails ao doador da doação mensal: confirmação (com link de cancelamento) e link pedido pelo site.
const { buildEmail } = require('./layout');

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

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

function buildCancelLinkEmail({ nome, links }) {
  return buildEmail({
    subject: 'Link para cancelar sua doação mensal',
    name: nome,
    paragraphs: ['Recebemos um pedido para cancelar a doação mensal feita com este e-mail.'],
    details: links.map(({ valor, url }) => [`Doação de ${currency.format(valor)}/mês`, url]),
    closing: 'Abra o link da doação que deseja cancelar (vale por 7 dias). Se não foi você, ignore este e-mail.',
  });
}

module.exports = { buildSubscriptionActiveEmail, buildCancelLinkEmail };
