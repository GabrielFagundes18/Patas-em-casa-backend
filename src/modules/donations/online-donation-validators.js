/*
 * ============================================================================
 * ARQUIVO: online-donation-validators.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADORES das DOAÇÕES ONLINE: formulário de doação do site (valor, nome,
 *   e-mail, tipo e campo anti-robô), pedido de link de cancelamento, token de
 *   cancelamento e filtro de status da lista de assinaturas no painel.
 *
 * PRINCIPAIS ITENS:
 *   - MIN_VALUE (R$ 5) e MAX_VALUE (R$ 10.000).
 *   - validateCheckout, validateCancelLinkRequest, validateCancelByToken,
 *     validateListSubscriptions (exportadas).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/validators.
 *   - Usado por: modules/public/public-routes.js e ./donation-routes.js.
 * ============================================================================
 */

// Validações reutilizáveis.
const { emailDetail, enumDetail, textDetail } = require('../../utils/validators');

// Limites do valor da doação online.
const MIN_VALUE = 5;
const MAX_VALUE = 10000;

/*
 * FUNÇÃO: validateCheckout
 * O que faz: valida o formulário de doação do site.
 * Retorno (array): detalhes de erro.
 */
function validateCheckout({ body }) {
  const valor = Number(body.valor);
  return [
    // Valor: número (não texto), entre os limites e com até 2 casas decimais.
    // (O "? :" vale para toda a sequência de "&&".)
    typeof body.valor === 'number' && Number.isFinite(valor) && valor >= MIN_VALUE && valor <= MAX_VALUE
      && Math.round(valor * 100) === valor * 100
      ? null
      : { field: 'valor', message: `Escolha um valor entre R$ ${MIN_VALUE} e R$ ${MAX_VALUE.toLocaleString('pt-BR')}.` },
    // Nome obrigatório.
    textDetail(body, 'nome', { min: 2, max: 150, required: true, message: 'Informe seu nome.' }),
    // E-mail obrigatório.
    emailDetail(body, true),
    // Tipo: única ou recorrente (mensal).
    body.tipo === undefined ? { field: 'tipo', message: 'Escolha doação única ou mensal.' } : enumDetail(body.tipo, 'tipo', ['unica', 'recorrente']),
    // Honeypot anti-robô: o campo "website" fica escondido no site; preenchido = robô.
    body.website ? { field: 'website', message: 'Não foi possível iniciar a doação.' } : null,
  ].filter(Boolean);
}

/*
 * FUNÇÃO: validateCancelLinkRequest
 * O que faz: o pedido de link de cancelamento precisa de um e-mail válido.
 */
function validateCancelLinkRequest({ body }) {
  const detail = emailDetail(body, true);
  return detail ? [detail] : [];
}

/*
 * FUNÇÃO: validateCancelByToken
 * O que faz: o token do link precisa ser texto de 20 a 200 caracteres.
 */
function validateCancelByToken({ body }) {
  return typeof body.token === 'string' && body.token.length >= 20 && body.token.length <= 200
    ? []
    : [{ field: 'token', message: 'Link inválido. Abra novamente o link recebido por e-mail.' }];
}

/*
 * FUNÇÃO: validateListSubscriptions
 * O que faz: filtro de status (opcional) da lista de assinaturas.
 */
function validateListSubscriptions({ query }) {
  const detail = enumDetail(query.status, 'status', ['pendente', 'ativa', 'pausada', 'cancelada']);
  return detail ? [detail] : [];
}

// Exporta os validadores.
module.exports = { validateCheckout, validateCancelLinkRequest, validateCancelByToken, validateListSubscriptions };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   As rotas públicas de doação (com limite de envios por IP) e a lista de
 *   assinaturas do painel usam estes validadores antes de chamar o controller.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Limites de valor e casas decimais em pagamentos.
 *   - toLocaleString('pt-BR') para formatar números (10000 → "10.000").
 *   - Honeypot contra robôs em formulários públicos.
 * ============================================================================
 */
