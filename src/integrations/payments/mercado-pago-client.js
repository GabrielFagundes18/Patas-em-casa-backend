/*
 * ============================================================================
 * ARQUIVO: mercado-pago-client.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   CLIENTE da API do MERCADO PAGO (o serviço de pagamentos usado nas doações
 *   online). Faz as chamadas HTTP necessárias:
 *     - criar "preferência" (pagamento único pelo Checkout Pro);
 *     - consultar pagamento;
 *     - criar/consultar/cancelar "preapproval" (assinatura = doação mensal);
 *     - consultar cobranças de assinatura.
 *   Também VERIFICA A ASSINATURA dos webhooks (avisos que o Mercado Pago envia),
 *   para ter certeza de que vieram mesmo dele.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - gatewayUnavailable(): erro 502 padrão (exportada).
 *   - createMercadoPagoClient({ accessToken, fetchImpl, log }): cria o cliente (exportada).
 *   - verifyWebhookSignature({...}): confere a assinatura HMAC do webhook (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - node:crypto, ../../utils/app-error, ../../utils/logger.
 *   - Usado por: modules/donations/online-donation-service.js.
 * ============================================================================
 */

// createHmac: assinatura com chave secreta; randomUUID: ids únicos; timingSafeEqual: comparação segura.
const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');
// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Logs.
const logger = require('../../utils/logger');

// Endereço da API e tempo máximo de espera por resposta.
const API_URL = 'https://api.mercadopago.com';
const TIMEOUT_MS = 10000;

/*
 * FUNÇÃO: gatewayUnavailable
 * O que faz: cria o erro 502 (Bad Gateway = "o serviço externo falhou") com mensagem amigável.
 */
function gatewayUnavailable() {
  return new AppError(502, 'GATEWAY_INDISPONIVEL', 'Não foi possível falar com o Mercado Pago agora. Tente novamente em instantes.');
}

/*
 * FUNÇÃO: createMercadoPagoClient (fábrica)
 * Parâmetros (objeto):
 *   - accessToken (string): credencial da conta no Mercado Pago.
 *   - fetchImpl (função, padrão: fetch do Node): permite trocar por um "fetch falso" nos testes.
 *   - log (padrão: logger).
 * Retorno: objeto com createPreference, getPayment, createPreapproval, getPreapproval,
 *   cancelPreapproval e getAuthorizedPayment.
 */
// Cliente REST mínimo do Mercado Pago (Checkout Pro, assinaturas e consultas usadas pelos webhooks).
// Credenciais: MERCADOPAGO_ACCESS_TOKEN (Bearer). Toda criação leva X-Idempotency-Key, então uma repetição
// por falha de rede não gera cobrança duplicada.
function createMercadoPagoClient({ accessToken, fetchImpl = fetch, log = logger }) {
  /*
   * FUNÇÃO INTERNA: call (async)
   * O que faz: faz uma requisição à API do Mercado Pago e devolve o JSON da resposta.
   * Parâmetros: method ('GET'|'POST'|'PUT'), path (ex.: '/v1/payments/123'), body (objeto, opcional).
   * Retorno: os dados da resposta. Lança gatewayUnavailable() se não houver resposta ou se der erro.
   */
  async function call(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        headers: {
          // Autenticação com o token de acesso.
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          // Em criações (POST), uma chave única: se a mesma requisição chegar duas vezes, o Mercado Pago
          // reconhece a repetição e não cria duas cobranças ("idempotência").
          ...(method === 'POST' ? { 'X-Idempotency-Key': randomUUID() } : {}),
        },
        // Corpo em JSON (ou nenhum, em GET).
        body: body === undefined ? undefined : JSON.stringify(body),
        // Cancela a requisição se passar de 10 s.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Sem resposta (rede, tempo esgotado): registra e lança 502.
      log.error('mercadopago_sem_resposta', { module: 'donations', code: error.name });
      throw gatewayUnavailable();
    }

    // Lê o JSON; se a resposta não for JSON, usa {} (.catch evita quebrar).
    const data = await response.json().catch(() => ({}));
    // response.ok = status entre 200 e 299.
    if (!response.ok) {
      log.error('mercadopago_erro', { module: 'donations', statusCode: response.status, code: String(data.error || data.message || '') });
      throw gatewayUnavailable();
    }
    return data;
  }

  // Cada função é um "atalho" para um endereço da API.
  // encodeURIComponent protege o id dentro da URL.
  return {
    // Pagamento único (Checkout Pro).
    createPreference: (body) => call('POST', '/checkout/preferences', body),
    // Consultar um pagamento.
    getPayment: (id) => call('GET', `/v1/payments/${encodeURIComponent(id)}`),
    // Criar assinatura (doação mensal).
    createPreapproval: (body) => call('POST', '/preapproval', body),
    // Consultar assinatura.
    getPreapproval: (id) => call('GET', `/preapproval/${encodeURIComponent(id)}`),
    // Cancelar assinatura.
    cancelPreapproval: (id) => call('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' }),
    // Consultar uma cobrança mensal da assinatura.
    getAuthorizedPayment: (id) => call('GET', `/authorized_payments/${encodeURIComponent(id)}`),
  };
}

/*
 * FUNÇÃO: verifyWebhookSignature
 * O que faz: confere se o webhook foi assinado pelo Mercado Pago com o nosso segredo.
 * Parâmetros (objeto):
 *   - signatureHeader (string): cabeçalho x-signature, ex.: "ts=1700000000,v1=abc123...".
 *   - requestId (string): cabeçalho x-request-id.
 *   - dataId (string): id do recurso avisado (data.id).
 *   - secret (string): segredo do webhook configurado no Mercado Pago.
 * Retorno (boolean): true se a assinatura conferir.
 */
// Assinatura do webhook (cabeçalho x-signature: "ts=...,v1=..."): HMAC-SHA256, em hexadecimal, do texto
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com a assinatura secreta configurada no Mercado Pago.
// data.id alfanumérico entra em minúsculas. Comparação em tempo constante.
function verifyWebhookSignature({ signatureHeader, requestId, dataId, secret }) {
  // Sem cabeçalho ou sem segredo: não dá para confiar.
  if (!signatureHeader || !secret) return false;
  // "ts=...,v1=..." → { ts: '...', v1: '...' }.
  const parts = Object.fromEntries(String(signatureHeader).split(',').map((part) => part.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;

  // Monta o texto ("manifesto") que o Mercado Pago assinou, na mesma ordem e formato.
  const manifest = [
    dataId ? `id:${String(dataId).toLowerCase()};` : '',
    requestId ? `request-id:${requestId};` : '',
    `ts:${parts.ts};`,
  ].join('');
  // Calcula a assinatura esperada com o nosso segredo.
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const received = String(parts.v1);
  // Compara em tempo constante (timingSafeEqual), para não vazar pistas pelo tempo de comparação.
  // A checagem de tamanho vem antes porque timingSafeEqual exige buffers do mesmo tamanho.
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Exporta a fábrica, a verificação e o erro padrão.
module.exports = { createMercadoPagoClient, verifyWebhookSignature, gatewayUnavailable };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - Ida: o service de doações chama createPreference/createPreapproval etc.;
 *     "call" faz o fetch com token, chave de idempotência e tempo limite.
 *   - Volta: o Mercado Pago avisa por webhook; antes de acreditar, o service chama
 *     verifyWebhookSignature e depois consulta o recurso (getPayment, getPreapproval...).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - APIs REST, fetch, cabeçalhos e status HTTP (response.ok).
 *   - Idempotência em pagamentos.
 *   - Webhooks e assinatura HMAC; comparação em tempo constante.
 *   - AbortSignal.timeout e tratamento de falhas de rede (erro 502).
 * ============================================================================
 */
