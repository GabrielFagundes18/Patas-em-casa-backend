# Doações (`/api/v1/donations`) e webhook (`/api/v1/webhooks`)

Rotas: `src/modules/donations/donation-routes.js` (todas com `requireAuth`) e `webhook-routes.js` (sem login).
Doações manuais: `donation-controller.js` → `donation-service.js` → `donation-repository.js`. Doações online e
assinaturas: `online-donation-controller.js` → `online-donation-service.js` → `online-donation-repository.js` +
`src/integrations/payments/mercado-pago-client.js`. As rotas públicas de doação estão em [publico.md](publico.md).

**Objeto doação:**

```json
{ "id": "…", "adotante_id": null, "adotante_nome": null, "doador_nome": "João Lima", "doador_email": "jo***@email.com",
  "tipo": "unica", "valor": 50, "metodo": "pix", "status": "confirmada", "data": "2026-10-01T13:00:00.000Z",
  "gateway": null, "gateway_status": null, "assinatura_id": null }
```

`valor` sai como número. `doador_email` sai **mascarado** na listagem e na exportação, e completo no detalhe, no
cadastro e na edição. `gateway`/`gateway_status`/`assinatura_id` são preenchidos nas doações online.

---

## `GET /api/v1/donations` — Listar

| | |
| --- | --- |
| Permissão | `donations:read` |
| Validador | `validateListDonations` |
| Controller / Service | `donation-controller.list` → `donation-service.list` |

**Query:** `page`, `pageSize`; `q` (nome **ou** e-mail do doador); `tipo` (`unica`, `recorrente`); `metodo` (`pix`,
`cartao`, `boleto`, `transferencia`); `status` (`pendente`, `confirmada`, `cancelada`, `falhou`); `adotante_id` (UUID);
`de`/`ate` (`AAAA-MM-DD`, `ate` inclui o dia; `ate ≥ de`); `sort` (`data` — padrão —, `valor`, `doador_nome`,
`status`); `order` (padrão `desc`).

**Resposta 200:** lista paginada de doações (e-mail mascarado).

---

## `GET /api/v1/donations/summary` — Resumo

| | |
| --- | --- |
| Permissão | `donations:read` |
| Validador | `validateSummary` (`de`, `ate`) |
| Controller / Service | `donation-controller.summary` → `donation-service.summary` |

**Resposta 200:**

```json
{ "data": { "periodo": { "de": "2026-01-01", "ate": null }, "total_confirmado": 1250.5, "arrecadado_mes_atual": 350.5,
  "por_status": [ { "chave": "confirmada", "quantidade": 20, "total": 1250.5 } ],
  "por_metodo": [ { "chave": "pix", "quantidade": 12, "total": 700 } ],
  "por_tipo": [ { "chave": "unica", "quantidade": 18, "total": 1100.5 } ] }, "meta": {} }
```

**Regras:** `por_status` considera todas as doações do período; `por_metodo` e `por_tipo`, só as `confirmada`
(`nao_informado` quando sem método). `arrecadado_mes_atual` vem da view `vw_kpis_gerais` e **ignora o período**.

---

## `GET /api/v1/donations/monthly` — Série mensal

| | |
| --- | --- |
| Permissão | `donations:read` |
| Validador | `validateMonthly` (`meses`: inteiro de 1 a 36; padrão 12) |
| Controller / Service | `donation-controller.monthly` → `donation-service.monthly` → view `vw_doacoes_por_mes` |

**Resposta 200:** `{ "data": [ { "mes": "2026-09", "total": 420, "quantidade": 6 } ], "meta": {} }`

**Regras:** só doações `confirmada`; só aparecem meses com doação (sem preencher meses vazios — ao contrário do
dashboard). ⚠️ A confirmar: o mês vem de `date_trunc` no fuso do banco e é convertido para texto em UTC; com o banco
fora de UTC, o rótulo do mês pode deslocar.

---

## `GET /api/v1/donations/export` — Exportar CSV

| | |
| --- | --- |
| Permissão | `donations:export` |
| Validador | `validateListDonations` |
| Controller / Service | `donation-controller.exportCsv` → `donation-service.listForExport` |

**Resposta 200:** CSV `doacoes-AAAA-MM-DD.csv` (`;`, BOM, CRLF), ordenado pela data mais recente. Colunas: ID; Data
(`AAAA-MM-DD`); Doador; E-mail (mascarado); Tipo; Método; Status; Valor (R$) (`50,00`).

**Regras:** auditoria `exportar` com a quantidade de linhas. Erro: 422 `EXPORTACAO_MUITO_GRANDE`.

---

## `GET /api/v1/donations/subscriptions` — Listar doações mensais (assinaturas)

| | |
| --- | --- |
| Permissão | `donations:read` |
| Validador | `validateListSubscriptions` (`status`: `pendente`, `ativa`, `pausada`, `cancelada`) |
| Controller / Service | `online-donation-controller.listSubscriptions` → `online-donation-service.listSubscriptions` |

**Query:** `status`, `page`, `pageSize`. A paginação não é conferida pelo validador; valor inválido gera 400
`PARAMETRO_INVALIDO` (em vez do 422 das outras listas).

**Resposta 200:**

```json
{ "data": [ { "id": "…", "doador_nome": "João Lima", "doador_email": "joao@email.com", "valor": 30, "status": "ativa",
  "criado_em": "…", "cancelada_em": null, "pagamentos_confirmados": 3, "total_arrecadado": 90 } ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 } }
```

**Regras:** ordem: mais recentes primeiro. `pagamentos_confirmados`/`total_arrecadado` somam as doações `confirmada`
ligadas à assinatura. ⚠️ O e-mail do doador sai **sem máscara** nesta lista.

---

## `POST /api/v1/donations/subscriptions/:id/cancel` — Cancelar doação mensal (painel)

| | |
| --- | --- |
| Permissão | `donations:update` |
| Validador | `validateIdParam` |
| Controller / Service | `online-donation-controller.cancelSubscription` → `online-donation-service.cancelSubscriptionById` |

**Resposta 200:**

```json
{ "data": { "id": "…", "doador_nome": "João Lima", "doador_email": "joao@email.com", "valor": 30, "status": "cancelada",
  "gateway": "mercado_pago", "gateway_assinatura_id": "2c938084…", "criado_em": "…", "atualizado_em": "…",
  "cancelada_em": "…" }, "meta": {} }
```

**Erros específicos:** 404 `ASSINATURA_NAO_ENCONTRADA`; 503 `PAGAMENTO_INDISPONIVEL`; 502 `GATEWAY_INDISPONIVEL`.

**Regras:** cancela a preapproval no Mercado Pago (se houver id), marca `cancelada` com `cancelada_em` e apaga o token
de cancelamento. Já cancelada: devolvida como está. Auditoria `cancelar_assinatura`.

---

## `GET /api/v1/donations/:id` — Detalhe

| | |
| --- | --- |
| Permissão | `donations:read` |
| Controller / Service | `donation-controller.getById` → `donation-service.getById` |

**Resposta 200:** objeto doação com e-mail completo. **Erro:** 404 `DOACAO_NAO_ENCONTRADA`.

---

## `POST /api/v1/donations` — Registrar doação manual

| | |
| --- | --- |
| Permissão | `donations:create` |
| Validador | `validateCreateDonation` |
| Controller / Service | `donation-controller.create` → `donation-service.create` |

**Body:**

| Campo | Tipo | Obrigatório | Validação / padrão |
| --- | --- | --- | --- |
| `doador_nome` | texto | sim | 2–150 |
| `tipo` | texto | sim | `unica`, `recorrente` |
| `valor` | número ou texto numérico | sim | > 0, até 99.999.999,99, no máximo 2 casas decimais |
| `metodo` | texto \| null | não | `pix`, `cartao`, `boleto`, `transferencia` |
| `status` | texto | não | `pendente`, `confirmada`, `cancelada`, `falhou`; padrão `confirmada` |
| `doador_email` | texto \| null \| `""` | não | Formato de e-mail, até 150; vazio = sem e-mail |
| `adotante_id` | UUID \| null \| `""` | não | Vincula a um adotante |
| `data` | texto ISO 8601 \| null | não | Não pode estar no futuro (tolerância de 1 min); padrão: agora |

**Resposta 201:** objeto doação. **Erro específico:** 422 `ADOTANTE_INVALIDO` (adotante inexistente — chave estrangeira).

**Regras:** nome com `trim`, e-mail em minúsculas. Auditoria `criar`.

---

## `PATCH /api/v1/donations/:id` — Editar doação manual

| | |
| --- | --- |
| Permissão | `donations:update` |
| Validador | `validateIdParam` + `validateUpdateDonation` |
| Controller / Service | `donation-controller.update` → `donation-service.update` |

**Body:** os mesmos campos do cadastro, todos opcionais (ao menos um).

**Resposta 200:** objeto doação.

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 404 | `DOACAO_NAO_ENCONTRADA` | |
| 409 | `DOACAO_CANCELADA` | A doação está `cancelada` (definitiva) |
| 409 | `DOACAO_ONLINE` | A doação veio do Mercado Pago (`gateway` preenchido): só muda pelos webhooks |
| 422 | `ADOTANTE_INVALIDO` | `adotante_id` inexistente |

**Regras:** auditoria `alterar_status` (se o status mudou) ou `editar`, só com os campos alterados.
⚠️ A confirmar: `doador_nome: null` passa no validador (na edição o campo não é obrigatório e `textDetail` aceita
`null`), mas a coluna é `NOT NULL`; pela leitura do código, a resposta seria 500 `ERRO_INTERNO` em vez de 422.

---

## `POST /api/v1/webhooks/mercadopago` — Notificações do Mercado Pago

| | |
| --- | --- |
| Autenticação | Nenhum login; autenticidade pela assinatura `x-signature` |
| Limite | Só o global da API (1000 / 5 min por IP) |
| Controller / Service | `online-donation-controller.mercadoPagoWebhook` → `online-donation-service.handleWebhook` |

**Entrada:**

| Origem | Campo | Uso |
| --- | --- | --- |
| Cabeçalho | `x-signature` (`ts=…,v1=…`) | Assinatura HMAC-SHA256 |
| Cabeçalho | `x-request-id` | Entra no texto assinado e, na falta de `id` no corpo, identifica o evento |
| Query | `type` ou `topic`; `data.id` ou `id` | Tipo e id do recurso (alternativa ao corpo) |
| Body | `type`, `data.id`, `id`, `action` | Tipo, id do recurso, id da notificação |

**Resposta 200** (o Mercado Pago só precisa de 2xx):

```json
{ "data": { "status": "processado" }, "meta": {} }
```

`status`: `processado`, `ignorado` (tipo não tratado, sem id ou recurso não encontrado) ou `duplicado` (notificação já registrada).

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 503 | `PAGAMENTO_INDISPONIVEL` | Mercado Pago não configurado |
| 401 | `ASSINATURA_INVALIDA` | Assinatura ausente ou diferente da calculada |
| 502 | `GATEWAY_INDISPONIVEL` | Falha ao consultar o recurso no Mercado Pago (o MP reenvia) |

**Regras:**

1. Confere a assinatura: HMAC-SHA256 (hex) de `id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;` com
   `MERCADOPAGO_WEBHOOK_SECRET`, comparada em tempo constante.
2. Só trata `payment`, `subscription_preapproval` e `subscription_authorized_payment`.
3. Registra a notificação em `gateway_webhook_eventos` (id = `body.id`, ou `x-request-id`, ou `tipo:id:ação`); se já
   existir, responde `duplicado` sem reprocessar.
4. **Consulta o estado atual na API do Mercado Pago** (o corpo da notificação nunca é usado como fonte da verdade) e
   atualiza o banco; marca o evento como `processado`, `ignorado` ou `falhou` (com o código do erro).

| Tipo | O que faz |
| --- | --- |
| `payment` | `GET /v1/payments/:id`. Se `external_reference` é uma doação (ou o pagamento já está ligado a uma), atualiza status, método, id e status do gateway. Se é uma assinatura, grava/atualiza a cobrança mensal como doação `recorrente` (uma linha por pagamento) |
| `subscription_preapproval` | `GET /preapproval/:id`; atualiza o status da assinatura (`cancelada` grava `cancelada_em`). Na passagem `pendente → ativa`, gera o link de cancelamento (7 dias) e envia o e-mail de "doação mensal ativa" |
| `subscription_authorized_payment` | `GET /authorized_payments/:id`; grava/atualiza a cobrança da assinatura como doação `recorrente` |

**Mapeamentos:**

| Pagamento no MP | Status da doação |
| --- | --- |
| `approved`, `authorized` | `confirmada` |
| `pending`, `in_process`, `in_mediation` | `pendente` |
| `rejected` | `falhou` |
| `cancelled`, `refunded`, `charged_back` | `cancelada` |
| outro | `pendente` |

| Tipo de pagamento no MP | Método |
| --- | --- |
| `payment_method_id = pix` ou `payment_type_id = bank_transfer` | `pix` |
| `credit_card`, `debit_card`, `prepaid_card` | `cartao` |
| `ticket` | `boleto` |
| outro (ex.: saldo em conta) | `null` |

| Preapproval no MP | Assinatura |
| --- | --- |
| `authorized` | `ativa` |
| `paused` | `pausada` |
| `cancelled` | `cancelada` |
| `pending` | `pendente` |

⚠️ A confirmar: quando o processamento falha, o evento fica registrado como `falhou`; um reenvio com o mesmo id de
notificação cai na regra de duplicidade e responde `duplicado`, sem reprocessar.
