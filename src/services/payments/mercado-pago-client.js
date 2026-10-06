const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');
const AppError = require('../../utils/app-error');
const logger = require('../../utils/logger');

const API_URL = 'https://api.mercadopago.com';
const TIMEOUT_MS = 10000;

function gatewayUnavailable() {
  return new AppError(502, 'GATEWAY_INDISPONIVEL', 'Não foi possível falar com o Mercado Pago agora. Tente novamente em instantes.');
}

// Cliente REST mínimo do Mercado Pago (Checkout Pro, assinaturas e consultas usadas pelos webhooks).
// Credenciais: MERCADOPAGO_ACCESS_TOKEN (Bearer). Toda criação leva X-Idempotency-Key, então uma repetição
// por falha de rede não gera cobrança duplicada.
function createMercadoPagoClient({ accessToken, fetchImpl = fetch, log = logger }) {
  async function call(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(method === 'POST' ? { 'X-Idempotency-Key': randomUUID() } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      log.error('mercadopago_sem_resposta', { module: 'donations', code: error.name });
      throw gatewayUnavailable();
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      log.error('mercadopago_erro', { module: 'donations', statusCode: response.status, code: String(data.error || data.message || '') });
      throw gatewayUnavailable();
    }
    return data;
  }

  return {
    createPreference: (body) => call('POST', '/checkout/preferences', body),
    getPayment: (id) => call('GET', `/v1/payments/${encodeURIComponent(id)}`),
    createPreapproval: (body) => call('POST', '/preapproval', body),
    getPreapproval: (id) => call('GET', `/preapproval/${encodeURIComponent(id)}`),
    cancelPreapproval: (id) => call('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' }),
    getAuthorizedPayment: (id) => call('GET', `/authorized_payments/${encodeURIComponent(id)}`),
  };
}

// Assinatura do webhook (cabeçalho x-signature: "ts=...,v1=..."): HMAC-SHA256, em hexadecimal, do texto
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com a assinatura secreta configurada no Mercado Pago.
// data.id alfanumérico entra em minúsculas. Comparação em tempo constante.
function verifyWebhookSignature({ signatureHeader, requestId, dataId, secret }) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(String(signatureHeader).split(',').map((part) => part.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;

  const manifest = [
    dataId ? `id:${String(dataId).toLowerCase()};` : '',
    requestId ? `request-id:${requestId};` : '',
    `ts:${parts.ts};`,
  ].join('');
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const received = String(parts.v1);
  return received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

module.exports = { createMercadoPagoClient, verifyWebhookSignature, gatewayUnavailable };
