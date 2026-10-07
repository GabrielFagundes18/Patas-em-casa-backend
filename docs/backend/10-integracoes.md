# 10. Integrações externas

| Serviço | Arquivos | Configuração | Sem configuração |
| --- | --- | --- | --- |
| PostgreSQL (Neon) | `src/db/pool.js`, `connection-check.js`, `transaction.js`, `sql.js` | `DATABASE_URL_DIRECT` ou `DATABASE_URL` | A API sobe, mas toda consulta falha; `/ready` responde 503 `mock` (ver [saude.md](04-endpoints/saude.md)) |
| E-mail (SMTP) | `src/integrations/email/{mailer, layout, account-emails, adoption-emails, donation-emails}.js` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Sem `SMTP_HOST`, nenhum e-mail sai; as ações continuam valendo e a resposta avisa (`email.enviado: false`) |
| Mercado Pago | `src/integrations/payments/mercado-pago-client.js` | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` (obrigatório junto com o token; sem ele a API não sobe) | Doação online responde 503 `PAGAMENTO_INDISPONIVEL`; o webhook também |
| Disco local (fotos) | `src/integrations/storage/photo-storage.js` | `UPLOAD_DIR`, `API_PUBLIC_URL` | Usa os padrões de `env.js` |

As variáveis e seus padrões estão em [2. Como rodar](02-como-rodar.md#variáveis-de-ambiente).

## Banco de dados

- Pool `pg` com no máximo 10 conexões, ociosas fecham em 30 s, timeout de conexão de 10 s.
- Usa `DATABASE_URL_DIRECT` se existir, senão `DATABASE_URL`. TLS ligado quando há URL, com
  `ssl: { rejectUnauthorized: false }`. Na versão instalada do `pg` (8.x), um `sslmode` na própria URL **tem
  prioridade** sobre essa opção: com `sslmode=verify-full` ou `require` (o caso das URLs do Neon e do exemplo do README)
  o certificado é verificado; **sem `sslmode` na URL, não é** (ver [16. Pontos de atenção](16-pontos-de-atencao.md)).
  Conferido instanciando `pg/lib/connection-parameters` com as duas formas de URL.
- Colunas `DATE` chegam como texto `AAAA-MM-DD` (parser próprio para o OID 1082) para não deslocar o dia pelo fuso.
- Erros do pool vão para o log só com o código (`database_pool_error`).
- `withTransaction(work)` (`src/db/transaction.js`): `BEGIN`/`COMMIT`, `ROLLBACK` em qualquer erro; se o `ROLLBACK`
  falhar, a conexão é descartada.
- `testConnection()` (`connection-check.js`, usado por `/ready`): `SELECT 1` com até 3 tentativas (espera 400 ms × n).

## E-mail (SMTP, `nodemailer`)

`mailer.js` cria o transporte na primeira mensagem, com timeouts de conexão 10 s, saudação 10 s e socket 20 s.
`isConfigured()` é falso quando `SMTP_HOST` está vazia; quem chama verifica antes. Porta padrão 587; `secure` padrão
verdadeiro só na porta 465; remetente `EMAIL_FROM` ou, na falta, `SMTP_USER` (sem nenhum dos dois com `SMTP_HOST`
definida, a API não sobe). O e-mail **nunca** é condição para
gravar a ação: o envio acontece depois de salvar, e a falha só vira log e aviso.

`layout.js` monta cada mensagem em texto puro e HTML (mesmo conteúdo), com saudação pelo primeiro nome, parágrafos,
tabela de detalhes, nota destacada, botão de ação e assinatura "Equipe Patas em Casa". Todo valor é escapado no HTML
(`escapeHtml`).

| Modelo | Arquivo | Assunto | Disparado por |
| --- | --- | --- | --- |
| Redefinição de senha | `account-emails.js` | Redefinição de senha do painel Patas em Casa | `POST /auth/forgot-password` (em segundo plano), via `access-link-service` |
| Convite | `account-emails.js` | Convite para o painel Patas em Casa | `POST /users` com `enviar_convite`, `POST /users/:id/invite` |
| Agendamento | `adoption-emails.js` | Visita/Entrevista agendada: adoção de <animal> | `POST /adoption-requests/:id/schedule` com `enviar_email: true` |
| Remarcação | `adoption-emails.js` | Visita/Entrevista remarcada: adoção de <animal> | `PATCH /adoption-requests/:id/appointments/:appointmentId` com `enviar_email: true` |
| Cancelamento | `adoption-emails.js` | Visita/Entrevista cancelada: adoção de <animal> | `POST /adoption-requests/:id/appointments/:appointmentId/cancel` com `enviar_email: true` |
| Decisão | `adoption-emails.js` | Adoção aprovada: <animal> vai para casa! / Sobre o seu pedido de adoção de <animal> | `POST /adoption-requests/:id/approve` e `/reject` com `notificar_adotante: true` (texto em `mensagem_adotante`) |
| Doação mensal ativa | `donation-emails.js` | Sua doação mensal para a Patas em Casa está ativa | Webhook: assinatura passa de `pendente` para `ativa` (inclui link de cancelamento de 7 dias) |
| Link de cancelamento | `donation-emails.js` | Link para cancelar sua doação mensal | `POST /public/donations/subscriptions/cancel-link` |

Datas e horários dos agendamentos são escritos no horário de Brasília (`utils/brasilia-time.js`). A justificativa
interna da decisão não vai para o adotante; só a mensagem escrita para ele.

Nos e-mails ao adotante, o resultado do envio (enviado ou motivo) é anotado no histórico do pedido como "Sistema" e
devolvido na resposta com o e-mail mascarado.

## Mercado Pago

Cliente REST próprio com `fetch` (sem SDK). Base `https://api.mercadopago.com`, `Authorization: Bearer
MERCADOPAGO_ACCESS_TOKEN`, timeout de 10 s. Toda requisição `POST` leva `X-Idempotency-Key` (UUID novo a cada chamada).

| Função | Método e caminho | Usada em |
| --- | --- | --- |
| `createPreference` | `POST /checkout/preferences` | Doação única (Checkout Pro) |
| `getPayment` | `GET /v1/payments/:id` | Webhook `payment` |
| `createPreapproval` | `POST /preapproval` | Doação mensal (assinatura) |
| `getPreapproval` | `GET /preapproval/:id` | Webhook `subscription_preapproval` |
| `cancelPreapproval` | `PUT /preapproval/:id` (`{status: 'cancelled'}`) | Cancelamento pelo link ou pelo painel |
| `getAuthorizedPayment` | `GET /authorized_payments/:id` | Webhook `subscription_authorized_payment` |

Falha de rede ou timeout → log `mercadopago_sem_resposta`; resposta não-2xx → log `mercadopago_erro` (status e código
do MP); em ambos a API responde 502 `GATEWAY_INDISPONIVEL`.

**Ambiente de teste:** se o token começa com `TEST-`, a API devolve o `sandbox_init_point` em vez do `init_point`.

### Fluxo da doação única

```mermaid
sequenceDiagram
  participant S as Site
  participant A as API
  participant DB as PostgreSQL
  participant MP as Mercado Pago
  S->>A: POST /public/donations/checkout {valor, nome, email, tipo: unica}
  A->>DB: INSERT doacoes (status pendente, gateway mercado_pago)
  A->>MP: POST /checkout/preferences (external_reference = id da doação, notification_url, back_urls)
  A-->>S: 201 {referencia, checkout_url}
  S->>MP: doador paga nas telas do MP
  MP->>A: POST /webhooks/mercadopago (type=payment, data.id)
  A->>A: confere x-signature (HMAC)
  A->>DB: INSERT gateway_webhook_eventos (idempotência)
  A->>MP: GET /v1/payments/:id
  A->>DB: UPDATE doacoes (status, método, ids do gateway)
  MP-->>S: volta para /doar/retorno?ref=…
  S->>A: GET /public/donations/status/:ref
```

Mapa de status do pagamento: `approved`/`authorized` → `confirmada`; `pending`/`in_process`/`in_mediation` →
`pendente`; `rejected` → `falhou`; `cancelled`/`refunded`/`charged_back` → `cancelada`; outro → `pendente`.
Método: Pix (`pix` ou `bank_transfer`), cartão (crédito, débito, pré-pago), boleto (`ticket`); saldo em conta fica sem
método.

### Doação mensal (assinatura)

1. `POST /public/donations/checkout` com `tipo: recorrente` cria `assinaturas_doacao` (`pendente`) e um *preapproval*
   mensal em BRL com `back_url` `/doar/retorno?assinatura=…`.
2. O webhook `subscription_preapproval` sincroniza o status (`authorized` → `ativa`, `paused` → `pausada`,
   `cancelled` → `cancelada`, `pending` → `pendente`). Na passagem `pendente → ativa`, gera o link de cancelamento e
   envia o e-mail de confirmação.
3. Cada cobrança mensal chega como `subscription_authorized_payment` (ou `payment` com a referência da assinatura) e
   vira/atualiza uma linha em `doacoes` ligada à assinatura (`upsertSubscriptionPayment`).
4. Cancelamento: pelo link do e-mail (`POST /public/donations/subscriptions/cancel`, token de 7 dias, só o hash
   SHA-256 no banco) ou pelo painel (`POST /donations/subscriptions/:id/cancel`). Os dois chamam `cancelPreapproval`
   no MP e marcam `cancelada`.

### Webhook (`POST /api/v1/webhooks/mercadopago`)

1. Sem Mercado Pago configurado → 503.
2. Lê `type` (corpo, `?type` ou `?topic`), `data.id` (query, corpo ou `?id`) e `x-request-id`.
3. Confere `x-signature` (`ts=…,v1=…`): HMAC-SHA256 em hexadecimal de `id:<data.id minúsculo>;request-id:<x-request-id>;ts:<ts>;`
   com `MERCADOPAGO_WEBHOOK_SECRET`, comparado em tempo constante. Inválida → 401 `ASSINATURA_INVALIDA`.
4. Tipo desconhecido ou sem `data.id` → 200 `ignorado`.
5. Registra o evento em `gateway_webhook_eventos` com `ON CONFLICT DO NOTHING` (chave: `id` do corpo, ou
   `x-request-id`, ou `tipo:recurso:ação`). Já existente → 200 `duplicado`.
6. Consulta o recurso **na API do MP** (o corpo da notificação nunca é usado como fonte da verdade) e atualiza o banco.
7. Marca o evento como `processado`/`ignorado`; em erro, marca `falhou` com o código e responde 500 para o MP tentar
   de novo. ⚠️ A confirmar: como o evento já ficou registrado, o reenvio com o mesmo id cai em `duplicado` e não é
   reprocessado (ver [16](16-pontos-de-atencao.md)).

## Armazenamento de fotos (disco)

- Pasta `UPLOAD_DIR/animais`, criada sob demanda; servida pela própria API em `/uploads/animais/<arquivo>`.
- O tipo vem do **conteúdo** (assinatura dos primeiros bytes), não do nome nem do `Content-Type`: JPEG (`FF D8 FF`),
  PNG (`89 50 4E 47 0D 0A 1A 0A`) ou WebP (`RIFF….WEBP`). Outro conteúdo → 422 `ARQUIVO_INVALIDO`.
- Nome do arquivo: `<UUID>.<ext>`, gravado com `flag: 'wx'` (nunca sobrescreve).
- Remoção usa `path.basename` da chave salva no banco, para não apagar nada fora da pasta.
- URL pública: `<API_PUBLIC_URL>/uploads/animais/<chave>`.
- O `Dockerfile` declara `VOLUME ["/app/uploads"]`; para as fotos sobreviverem a uma recriação do contêiner, o
  ambiente de execução precisa montar um volume persistente nesse caminho. ⚠️ A confirmar: o repositório não diz qual
  plataforma de hospedagem é usada nem se o volume é montado (ver [15. Deploy](15-deploy.md)).
