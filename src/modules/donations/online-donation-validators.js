const { emailDetail, enumDetail, textDetail } = require('../../utils/validators');

const MIN_VALUE = 5;
const MAX_VALUE = 10000;

function validateCheckout({ body }) {
  const valor = Number(body.valor);
  return [
    typeof body.valor === 'number' && Number.isFinite(valor) && valor >= MIN_VALUE && valor <= MAX_VALUE
      && Math.round(valor * 100) === valor * 100
      ? null
      : { field: 'valor', message: `Escolha um valor entre R$ ${MIN_VALUE} e R$ ${MAX_VALUE.toLocaleString('pt-BR')}.` },
    textDetail(body, 'nome', { min: 2, max: 150, required: true, message: 'Informe seu nome.' }),
    emailDetail(body, true),
    body.tipo === undefined ? { field: 'tipo', message: 'Escolha doação única ou mensal.' } : enumDetail(body.tipo, 'tipo', ['unica', 'recorrente']),
    body.website ? { field: 'website', message: 'Não foi possível iniciar a doação.' } : null,
  ].filter(Boolean);
}

function validateCancelLinkRequest({ body }) {
  const detail = emailDetail(body, true);
  return detail ? [detail] : [];
}

function validateCancelByToken({ body }) {
  return typeof body.token === 'string' && body.token.length >= 20 && body.token.length <= 200
    ? []
    : [{ field: 'token', message: 'Link inválido. Abra novamente o link recebido por e-mail.' }];
}

function validateListSubscriptions({ query }) {
  const detail = enumDetail(query.status, 'status', ['pendente', 'ativa', 'pausada', 'cancelada']);
  return detail ? [detail] : [];
}

module.exports = { validateCheckout, validateCancelLinkRequest, validateCancelByToken, validateListSubscriptions };
