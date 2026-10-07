# Rotas públicas (`/api/v1/public`)

Sem login. Arquivo de rotas: `src/modules/public/public-routes.js`. Só devolvem dados públicos (sem dados pessoais).
Os formulários (`adoption-requests`, `volunteers`, `donations/checkout`, `donations/subscriptions/cancel-link` e
`donations/subscriptions/cancel`) compartilham o limite de **10 envios por hora por IP** (somados entre eles).

---

## `GET /api/v1/public/animals` — Animais disponíveis para adoção

| | |
| --- | --- |
| Validador | `animal-validators.validateListAnimals` |
| Controller / Service | `public-controller.listAnimals` → `animal-service.listPublicPage` → `animal-repository.list` |

**Query:**

| Parâmetro | Tipo | Regra |
| --- | --- | --- |
| `page`, `pageSize` | inteiro ≥ 1 | Paginação (padrão 1 e 20; `pageSize` máx. 100) |
| `q` | texto ≤ 120 | Busca em nome **ou** raça (`ILIKE`) |
| `especie` | `cachorro` \| `gato` \| `outro` | Um único valor |
| `sexo` | `macho` \| `femea` | Um único valor |
| `porte` | `pequeno` \| `medio` \| `grande` | Um único valor |
| `status` | um status de animal | Validado, mas **ignorado**: a rota sempre filtra `disponivel` e `urgente` |
| `castrado`, `vacinado` | `true` \| `false` | |
| `idadeMin`, `idadeMax` | número 0–999,9 | `idadeMax ≥ idadeMin` |
| `sort` | `nome`, `data_entrada`, `idade_anos`, `status`, `especie`, `porte` | Padrão `data_entrada` |
| `order` | `asc` \| `desc` | Padrão `desc` (nulos por último) |

**Resposta 200:**

```json
{
  "data": [
    {
      "id": "6f1c2a9e-1111-4222-8333-444455556666", "nome": "Mel", "especie": "gato", "raca": "SRD",
      "sexo": "femea", "idade_anos": "1.0", "porte": "pequeno", "status": "disponivel",
      "descricao": "Sociável e adora colo.", "foto_url": "https://api.exemplo.org/uploads/animais/9c1e….webp",
      "data_entrada": "2026-07-28", "castrado": true, "vacinado": true, "temperamento": ["calma"]
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

**Regras:** só `disponivel` e `urgente`; campos internos (`criado_em`, `atualizado_em`) não saem.

---

## `GET /api/v1/public/animals/:id` — Perfil público do animal

| | |
| --- | --- |
| Validador | `validateIdParam` (UUID) |
| Controller / Service | `public-controller.getAnimal` → `animal-service.getPublicById` |

**Resposta 200:** os mesmos campos da listagem, mais a galeria:

```json
{ "data": { "id": "…", "nome": "Nino", "status": "urgente", "temperamento": ["brincalhão"],
  "fotos": [ { "id": "1b2c…", "url": "https://api.exemplo.org/uploads/animais/1b2c….jpg", "principal": true } ] }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando | Exemplo |
| --- | --- | --- | --- |
| 410 | `ANIMAL_INDISPONIVEL` | Animal `adotado` ou `em_processo` | `{ "error": { "code": "ANIMAL_INDISPONIVEL", "message": "Nino já encontrou um lar.", "details": [{ "field": "status", "message": "adotado" }] } }` |
| 404 | `ANIMAL_NAO_ENCONTRADO` | Inexistente ou `inativo` | `{ "error": { "code": "ANIMAL_NAO_ENCONTRADO", "message": "Animal não encontrado ou indisponível para adoção.", "details": [] } }` |

**Regras:** a mensagem de 410 usa o nome do animal ("já encontrou um lar" / "está em processo de adoção"); as fotos
vêm ordenadas com a principal primeiro.

---

## `GET /api/v1/public/stories` — Histórias publicadas

| | |
| --- | --- |
| Validador | inline em `public-routes.js`: `listQueryDetails(query, ['criado_em'])` |
| Controller / Service | `public-controller.listStories` → `story-service.listPublished` → `story-repository.listPublished` |

**Query:** `page`, `pageSize`. `q`, `sort` (`criado_em`) e `order` são validados, mas **ignorados**: a ordem é sempre
`criado_em` decrescente.

**Resposta 200:**

```json
{ "data": [ { "id": "…", "autor_nome": "Fernanda A.", "texto": "A Pipoca mudou nossa rotina.", "foto_url": null,
  "criado_em": "2024-06-01T00:00:00.000Z", "animal": { "id": "…", "nome": "Pipoca", "especie": "gato", "foto_url": null } } ],
  "meta": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 } }
```

**Regras:** só `publicado = true`; nenhum dado do adotante vinculado sai; `animal` é `null` sem vínculo.

---

## `GET /api/v1/public/adoption-steps` — Etapas do processo de adoção

| | |
| --- | --- |
| Controller / Service | `public-controller.listAdoptionSteps` → `adoption-step-service.listActive` → `adoption-step-repository.listActive` |

**Resposta 200:**

```json
{ "data": [ { "ordem": 1, "titulo": "Encontre", "descricao": "Navegue pelos pets disponíveis perto de você." } ], "meta": {} }
```

**Regras:** etapas com `is_active` diferente de `false`, ordenadas por `step_order`. Não há endpoint para cadastrar etapas.

---

## `GET /api/v1/public/stats` — Números públicos

| | |
| --- | --- |
| Controller / Service | `public-controller.getStats` → `dashboard-service.publicStats` → `dashboard-repository.publicNumbers` |

**Resposta 200:**

```json
{ "data": { "animais_resgatados": 11, "adocoes_realizadas": 4, "aguardando_lar": 6 }, "meta": {} }
```

**Regras:** `animais_resgatados` = total de linhas em `animais` (view `vw_kpis_gerais.total_animais`);
`adocoes_realizadas` = animais com status `adotado`; `aguardando_lar` = animais `disponivel` + `urgente`.

---

## `POST /api/v1/public/adoption-requests` — Pedido de adoção pelo site

| | |
| --- | --- |
| Limite | 10/h por IP (compartilhado) |
| Validador | `adoption-request-validator` |
| Controller / Service | `public-controller.createAdoptionRequest` → `adoption-request-service.create` → `adoption-request-repository` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `animal_id` | UUID | sim | Formato UUID |
| `nome` | texto | sim | 2–150 caracteres (após `trim`) |
| `email` | texto | sim | Formato de e-mail, até 150 |
| `telefone` | texto | sim | Só dígitos, espaço, `()+-`; 10–13 dígitos; até 20 caracteres |
| `cidade` | texto | sim | 2–100 |
| `rotina` | texto | sim | 10–2000 |
| `ambiente_seguro` | booleano | sim | Precisa ser `true` |
| `ciente_pos_adocao` | booleano | sim | Precisa ser `true` |
| `visita_preferida_em` | texto | não | `AAAA-MM-DDTHH:mm` (Brasília); no serviço, precisa estar no futuro |
| `website` | texto | não | Campo-isca: se preenchido, 422 (`field: "website"`) |

**Resposta 201:**

```json
{ "data": { "protocolo": "PAC-3F2A9C1B", "status": "novo", "data_pedido": "2026-10-07T12:00:00.000Z",
  "animal": { "id": "…", "nome": "Nino" } }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 422 | `DATA_NO_PASSADO` | `visita_preferida_em` não está no futuro |
| 404 | `ANIMAL_NAO_ENCONTRADO` | Animal inexistente |
| 409 | `ANIMAL_INDISPONIVEL` | Animal fora de `disponivel`/`urgente` |
| 409 | `PEDIDO_EM_ANDAMENTO` | Já há pedido aberto (`novo`, `em_analise`, `visita_agendada`) do mesmo e-mail para o animal |

**Regras:** tudo numa transação; o animal é lido com `FOR SHARE`. O adotante é encontrado pelo e-mail (sem diferenciar
maiúsculas); se não existir, é criado (`INSERT … ON CONFLICT (email) DO NOTHING`, depois nova busca — cobre envios
simultâneos); **um cadastro existente não é sobrescrito**. Telefone, cidade, as duas declarações e a rotina vão para
`observacoes` do pedido. O protocolo é `PAC-` + 8 primeiros caracteres do id. O pedido nasce `novo`, prioridade
`medio`, e **não altera o status do animal**. Nenhum e-mail é enviado.

---

## `POST /api/v1/public/volunteers` — Inscrição de voluntário

| | |
| --- | --- |
| Limite | 10/h por IP (compartilhado) |
| Validador | `volunteer-validators.validateVolunteerApplication` |
| Controller / Service | `public-controller.applyAsVolunteer` → `volunteer-service.apply` → `volunteer-repository` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `nome` | texto | sim | 2–150 |
| `email` | texto | sim | Formato de e-mail, até 150 |
| `telefone` | texto | sim | Só dígitos, espaço, `()+-`; 10–13 dígitos; até 20 caracteres |
| `areas` | lista de texto | sim, não vazia | Valores: `passeios`, `banho_e_tosa`, `divulgacao`, `eventos`, `transporte`, `fotografia`, `socializacao`, `captacao`, `manutencao` |
| `website` | texto | não | Campo-isca |

**Resposta 201:**

```json
{ "data": { "protocolo": "VOL-7A1B2C3D", "status": "recebida" }, "meta": {} }
```

**Regras:** transação. E-mail já cadastrado devolve o mesmo protocolo do cadastro existente, **sem alterar nem revelar**
nada. Novo voluntário entra como `inativo` (aguardando triagem), `data_inicio` = data atual, áreas sem repetição.
Auditoria `inscricao_publica` (sem autor).

---

## `POST /api/v1/public/donations/checkout` — Iniciar doação online

| | |
| --- | --- |
| Limite | 10/h por IP (compartilhado) |
| Validador | `online-donation-validators.validateCheckout` |
| Controller / Service | `online-donation-controller.checkout` → `online-donation-service.startCheckout` → repositório + `mercado-pago-client` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `valor` | **número** (não texto) | sim | 5 a 10.000, até 2 casas decimais |
| `nome` | texto | sim | 2–150 |
| `email` | texto | sim | Formato de e-mail, até 150 |
| `tipo` | texto | sim | `unica` ou `recorrente` |
| `website` | texto | não | Campo-isca |

**Resposta 201:**

```json
{ "data": { "tipo": "unica", "referencia": "c0ffee00-…", "checkout_url": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=…" }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 503 | `PAGAMENTO_INDISPONIVEL` | `MERCADOPAGO_ACCESS_TOKEN` não configurado |
| 502 | `GATEWAY_INDISPONIVEL` | Mercado Pago não respondeu (10 s) ou respondeu com erro |

**Regras:**

- `unica`: grava uma doação `pendente` (`gateway = mercado_pago`) e cria uma *preferência* do Checkout Pro com o valor,
  o pagador, `external_reference` = id da doação, retorno para `<FRONTEND_URL>/doar/retorno?ref=<id>` (sucesso,
  pendente e falha), `auto_return: approved`, `notification_url` = `<API_PUBLIC_URL>/api/v1/webhooks/mercadopago` e
  descritor `PATASEMCASA`.
- `recorrente`: grava uma assinatura `pendente` e cria uma *preapproval* mensal (BRL, frequência 1 mês) com retorno para
  `<FRONTEND_URL>/doar/retorno?assinatura=<id>`; guarda o id da preapproval.
- Com token iniciado por `TEST-`, devolve o `sandbox_init_point`. O doador paga nas telas do Mercado Pago: dados de
  cartão não passam pela API.

---

## `GET /api/v1/public/donations/status/:ref` — Situação da doação (página de retorno)

| | |
| --- | --- |
| Validador | nenhum middleware; o serviço confere se `ref` é UUID |
| Controller / Service | `online-donation-controller.status` → `online-donation-service.getPublicStatus` |

**Resposta 200:**

```json
{ "data": { "tipo": "unica", "status": "confirmada", "valor": 50 }, "meta": {} }
```

**Erros específicos:** 404 `DOACAO_NAO_ENCONTRADA` (referência inválida ou inexistente).

**Regras:** procura primeiro uma doação e depois uma assinatura (para assinatura, `tipo` = `recorrente` e `status` é o
da assinatura: `pendente`, `ativa`, `pausada` ou `cancelada`). Nenhum dado pessoal sai.

---

## `POST /api/v1/public/donations/subscriptions/cancel-link` — Pedir link de cancelamento

| | |
| --- | --- |
| Limite | 10/h por IP (compartilhado) |
| Validador | `validateCancelLinkRequest` (`email` obrigatório, formato, até 150) |
| Controller / Service | `online-donation-controller.requestCancelLink` → `online-donation-service.requestCancelLink` |

**Resposta 202** (sempre a mesma, exista ou não doação):

```json
{ "data": { "mensagem": "Se houver doação mensal ativa com este e-mail, enviaremos o link de cancelamento." }, "meta": {} }
```

**Regras:** se houver assinaturas `ativa`, `pausada` ou `pendente` com o e-mail **e** o SMTP estiver configurado, gera um
token por assinatura (válido por 7 dias, só o hash SHA-256 é guardado) e envia **um** e-mail com um link por
assinatura (`<FRONTEND_URL>/doar/cancelar?token=…`). Falha de envio só vai para o log.

---

## `POST /api/v1/public/donations/subscriptions/cancel` — Cancelar doação mensal pelo link

| | |
| --- | --- |
| Limite | 10/h por IP (compartilhado) |
| Validador | `validateCancelByToken` (`token`: texto de 20–200 caracteres) |
| Controller / Service | `online-donation-controller.cancelByToken` → `online-donation-service.cancelByToken` |

**Resposta 200:**

```json
{ "data": { "status": "cancelada", "valor": 30 }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 400 | `LINK_INVALIDO` | Token desconhecido ou expirado |
| 503 | `PAGAMENTO_INDISPONIVEL` | A assinatura tem id no gateway e o Mercado Pago não está configurado |
| 502 | `GATEWAY_INDISPONIVEL` | Falha ao cancelar a preapproval no Mercado Pago |

**Regras:** cancela a preapproval no Mercado Pago (se houver id) e marca a assinatura `cancelada`, com `cancelada_em`
e o token apagado. Assinatura já cancelada é devolvida como está.
