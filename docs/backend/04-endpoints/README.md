# 4. Endpoints da API

80 rotas: 79 rotas da API + o diretório estático `/uploads`. O contrato em OpenAPI 3.0.3 está em
[`docs/openapi.yaml`](../../openapi.yaml); o teste `tests/unit/openapi-coverage.test.js` garante que toda rota
registrada no Express está documentada lá e vice-versa.

## Convenções comuns

**Prefixo e formato.** Rotas de negócio em `/api/v1`, JSON UTF-8 (`express.json`, limite de 1 MB). Datas e horas em
ISO 8601 (UTC); colunas `DATE` em `AAAA-MM-DD`; horários de agenda informados como `AAAA-MM-DDTHH:mm` no horário de
Brasília. Campos `numeric` do banco que o serviço não converte (ex.: `idade_anos`) saem como texto decimal (`"2.0"`).

**Envelope de sucesso** (`src/utils/http-response.js`):

```json
{ "data": { }, "meta": {} }
```

Listas paginadas: `meta = { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 }`. Paginação por `page` e
`pageSize` (padrão 20, máximo 100 — valores maiores são reduzidos para 100; menores que 1 dão erro).

**Envelope de erro** (`src/middleware/error-handler.js`):

```json
{ "error": { "code": "VALIDACAO_INVALIDA", "message": "Verifique os campos informados.", "details": [ { "field": "email", "message": "Informe um e-mail válido." } ] } }
```

**Cabeçalhos.** Rotas protegidas: `Authorization: Bearer <token>`. Rotas que usam o cookie de renovação
(`/auth/refresh`, `/auth/logout`): `X-Requested-With: XMLHttpRequest`. Toda resposta traz `X-Request-Id`; respostas
sob `/api/` trazem `Cache-Control: no-store`; respostas limitadas trazem `RateLimit-Limit` e `RateLimit-Remaining`
(e `Retry-After` no 429).

**Erros comuns a todas as rotas da API** (não repetidos em cada endpoint):

| Status | Código | Quando |
| --- | --- | --- |
| 400 | `JSON_INVALIDO` | Corpo com JSON malformado |
| 400 | `CORPO_MUITO_GRANDE` | Corpo acima de 1 MB |
| 404 | `ROTA_NAO_ENCONTRADA` | Rota inexistente |
| 429 | `MUITAS_REQUISICOES` | Mais de 1000 requisições em 5 min pelo mesmo IP em `/api/v1` (ou limites específicos indicados na rota) |
| 500 | `ERRO_INTERNO` | Erro não previsto (sem detalhes na resposta; o log registra só o código, sem mensagem nem pilha) |

**Erros comuns a todas as rotas protegidas:**

| Status | Código | Quando |
| --- | --- | --- |
| 401 | `NAO_AUTENTICADO` | Sem `Authorization: Bearer` |
| 401 | `TOKEN_INVALIDO` | Token com assinatura inválida ou expirado |
| 401 | `SESSAO_INVALIDA` | Usuário inexistente, inativo, sem permissões, ou sessão revogada/expirada |
| 403 | `SEM_PERMISSAO` | O cargo não tem a permissão exigida pela rota |
| 422 | `VALIDACAO_INVALIDA` | Validador da rota encontrou problemas (`details` por campo) |

**Parâmetros de identificador.** `:id`, `:appointmentId` e `:photoId` precisam ser UUID; fora do formato, a rota
responde 422 `VALIDACAO_INVALIDA` (`field: "id"`) antes de consultar o banco.

**Listas com busca e ordenação.** Onde indicado: `q` (texto, até 120 caracteres), `sort` (campos permitidos por rota)
e `order` (`asc`/`desc`, sem diferenciar maiúsculas).

## Índice

| # | Método | Rota | Autenticação / permissão | Documento |
| --- | --- | --- | --- | --- |
| 1 | GET | `/` | pública | [saude.md](saude.md) |
| 2 | GET | `/health` | pública | [saude.md](saude.md) |
| 3 | GET | `/ready` | pública | [saude.md](saude.md) |
| 4 | GET | `/uploads/*` | pública (arquivos estáticos) | [saude.md](saude.md) |
| 5 | GET | `/api/v1/public/animals` | pública | [publico.md](publico.md) |
| 6 | GET | `/api/v1/public/animals/:id` | pública | [publico.md](publico.md) |
| 7 | GET | `/api/v1/public/stories` | pública | [publico.md](publico.md) |
| 8 | GET | `/api/v1/public/adoption-steps` | pública | [publico.md](publico.md) |
| 9 | GET | `/api/v1/public/stats` | pública | [publico.md](publico.md) |
| 10 | POST | `/api/v1/public/adoption-requests` | pública (10/h por IP*) | [publico.md](publico.md) |
| 11 | POST | `/api/v1/public/volunteers` | pública (10/h por IP*) | [publico.md](publico.md) |
| 12 | POST | `/api/v1/public/donations/checkout` | pública (10/h por IP*) | [publico.md](publico.md) |
| 13 | GET | `/api/v1/public/donations/status/:ref` | pública | [publico.md](publico.md) |
| 14 | POST | `/api/v1/public/donations/subscriptions/cancel-link` | pública (10/h por IP*) | [publico.md](publico.md) |
| 15 | POST | `/api/v1/public/donations/subscriptions/cancel` | pública (10/h por IP*) | [publico.md](publico.md) |
| 16 | POST | `/api/v1/auth/login` | pública (20/15 min por IP) | [autenticacao.md](autenticacao.md) |
| 17 | POST | `/api/v1/auth/refresh` | cookie + `X-Requested-With` | [autenticacao.md](autenticacao.md) |
| 18 | POST | `/api/v1/auth/logout` | cookie + `X-Requested-With` | [autenticacao.md](autenticacao.md) |
| 19 | POST | `/api/v1/auth/forgot-password` | pública (10/15 min por IP**) | [autenticacao.md](autenticacao.md) |
| 20 | POST | `/api/v1/auth/reset-password` | pública (10/15 min por IP**) | [autenticacao.md](autenticacao.md) |
| 21 | GET | `/api/v1/me` | Bearer | [autenticacao.md](autenticacao.md) |
| 22 | PATCH | `/api/v1/me/password` | Bearer | [autenticacao.md](autenticacao.md) |
| 23 | GET | `/api/v1/dashboard/summary` | `dashboard:read` | [dashboard.md](dashboard.md) |
| 24 | GET | `/api/v1/animals` | `animals:read` | [animais.md](animais.md) |
| 25 | GET | `/api/v1/animals/export` | `animals:export` | [animais.md](animais.md) |
| 26 | POST | `/api/v1/animals` | `animals:create` | [animais.md](animais.md) |
| 27 | PATCH | `/api/v1/animals/:id/status` | `animals:update` | [animais.md](animais.md) |
| 28 | GET | `/api/v1/animals/:id` | `animals:read` | [animais.md](animais.md) |
| 29 | PUT | `/api/v1/animals/:id` | `animals:update` | [animais.md](animais.md) |
| 30 | DELETE | `/api/v1/animals/:id` | `animals:delete` | [animais.md](animais.md) |
| 31 | POST | `/api/v1/animals/:id/photos` | `animals:update` | [animais.md](animais.md) |
| 32 | PATCH | `/api/v1/animals/:id/photos/:photoId/principal` | `animals:update` | [animais.md](animais.md) |
| 33 | DELETE | `/api/v1/animals/:id/photos/:photoId` | `animals:update` | [animais.md](animais.md) |
| 34 | GET | `/api/v1/adoption-requests` | `adoptions:read` | [pedidos-adocao.md](pedidos-adocao.md) |
| 35 | GET | `/api/v1/adoption-requests/board` | `adoptions:read` | [pedidos-adocao.md](pedidos-adocao.md) |
| 36 | GET | `/api/v1/adoption-requests/:id` | `adoptions:read` | [pedidos-adocao.md](pedidos-adocao.md) |
| 37 | POST | `/api/v1/adoption-requests/:id/reveal` | `adopters:reveal` | [pedidos-adocao.md](pedidos-adocao.md) |
| 38 | PATCH | `/api/v1/adoption-requests/:id` | `adoptions:update` | [pedidos-adocao.md](pedidos-adocao.md) |
| 39 | POST | `/api/v1/adoption-requests/:id/approve` | `adoptions:approve` | [pedidos-adocao.md](pedidos-adocao.md) |
| 40 | POST | `/api/v1/adoption-requests/:id/reject` | `adoptions:approve` | [pedidos-adocao.md](pedidos-adocao.md) |
| 41 | POST | `/api/v1/adoption-requests/:id/schedule` | `adoptions:update` | [pedidos-adocao.md](pedidos-adocao.md) |
| 42 | PATCH | `/api/v1/adoption-requests/:id/appointments/:appointmentId` | `adoptions:update` | [pedidos-adocao.md](pedidos-adocao.md) |
| 43 | POST | `/api/v1/adoption-requests/:id/appointments/:appointmentId/cancel` | `adoptions:update` | [pedidos-adocao.md](pedidos-adocao.md) |
| 44 | POST | `/api/v1/adoption-requests/:id/appointments/:appointmentId/complete` | `adoptions:update` | [pedidos-adocao.md](pedidos-adocao.md) |
| 45 | POST | `/api/v1/adoption-requests/:id/term-signed` | `adoptions:update` | [pedidos-adocao.md](pedidos-adocao.md) |
| 46 | GET | `/api/v1/adopters` | `adopters:read` | [adotantes.md](adotantes.md) |
| 47 | GET | `/api/v1/adopters/export` | `adopters:export` | [adotantes.md](adotantes.md) |
| 48 | GET | `/api/v1/adopters/:id` | `adopters:read` | [adotantes.md](adotantes.md) |
| 49 | POST | `/api/v1/adopters/:id/reveal` | `adopters:reveal` | [adotantes.md](adotantes.md) |
| 50 | PATCH | `/api/v1/adopters/:id` | `adopters:update` | [adotantes.md](adotantes.md) |
| 51 | GET | `/api/v1/adopters/:id/lgpd-export` | `lgpd:approve` | [adotantes.md](adotantes.md) |
| 52 | POST | `/api/v1/adopters/:id/anonymize` | `lgpd:approve` | [adotantes.md](adotantes.md) |
| 53 | DELETE | `/api/v1/adopters/:id` | `lgpd:approve` | [adotantes.md](adotantes.md) |
| 54 | GET | `/api/v1/donations` | `donations:read` | [doacoes.md](doacoes.md) |
| 55 | GET | `/api/v1/donations/summary` | `donations:read` | [doacoes.md](doacoes.md) |
| 56 | GET | `/api/v1/donations/monthly` | `donations:read` | [doacoes.md](doacoes.md) |
| 57 | GET | `/api/v1/donations/export` | `donations:export` | [doacoes.md](doacoes.md) |
| 58 | GET | `/api/v1/donations/subscriptions` | `donations:read` | [doacoes.md](doacoes.md) |
| 59 | POST | `/api/v1/donations/subscriptions/:id/cancel` | `donations:update` | [doacoes.md](doacoes.md) |
| 60 | GET | `/api/v1/donations/:id` | `donations:read` | [doacoes.md](doacoes.md) |
| 61 | POST | `/api/v1/donations` | `donations:create` | [doacoes.md](doacoes.md) |
| 62 | PATCH | `/api/v1/donations/:id` | `donations:update` | [doacoes.md](doacoes.md) |
| 63 | POST | `/api/v1/webhooks/mercadopago` | assinatura `x-signature` | [doacoes.md](doacoes.md) |
| 64 | GET | `/api/v1/volunteers` | `volunteers:read` | [voluntarios.md](voluntarios.md) |
| 65 | GET | `/api/v1/volunteers/:id` | `volunteers:read` | [voluntarios.md](voluntarios.md) |
| 66 | POST | `/api/v1/volunteers` | `volunteers:create` | [voluntarios.md](voluntarios.md) |
| 67 | PATCH | `/api/v1/volunteers/:id` | `volunteers:update` | [voluntarios.md](voluntarios.md) |
| 68 | DELETE | `/api/v1/volunteers/:id` | `volunteers:delete` | [voluntarios.md](voluntarios.md) |
| 69 | GET | `/api/v1/stories` | `stories:read` | [historias.md](historias.md) |
| 70 | GET | `/api/v1/stories/:id` | `stories:read` | [historias.md](historias.md) |
| 71 | POST | `/api/v1/stories` | `stories:create` | [historias.md](historias.md) |
| 72 | PATCH | `/api/v1/stories/:id` | `stories:update` | [historias.md](historias.md) |
| 73 | DELETE | `/api/v1/stories/:id` | `stories:delete` | [historias.md](historias.md) |
| 74 | GET | `/api/v1/users` | `team:read` | [equipe.md](equipe.md) |
| 75 | POST | `/api/v1/users` | `team:create` | [equipe.md](equipe.md) |
| 76 | GET | `/api/v1/users/:id` | `team:read` | [equipe.md](equipe.md) |
| 77 | PATCH | `/api/v1/users/:id` | `team:update` | [equipe.md](equipe.md) |
| 78 | POST | `/api/v1/users/:id/password` | `team:update` | [equipe.md](equipe.md) |
| 79 | POST | `/api/v1/users/:id/invite` | `team:update` | [equipe.md](equipe.md) |
| 80 | GET | `/api/v1/permissions` | `team:read` | [equipe.md](equipe.md) |

\* As cinco rotas públicas de formulário usam **a mesma instância** do limitador (`publicFormRateLimit` em
`src/modules/public/public-routes.js`): o limite de 10 envios por hora é **somado** entre elas, por IP.
\*\* `forgot-password` e `reset-password` também compartilham uma instância (10 por 15 min, somados).
