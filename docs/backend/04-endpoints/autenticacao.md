# Autenticação e conta (`/api/v1/auth`, `/api/v1/me`)

Rotas: `src/modules/auth/auth-routes.js` (montado em `/api/v1`). O fluxo completo está em
[7. Autenticação e autorização](../07-autenticacao-autorizacao.md).

**Cookie de renovação** (`patas_refresh`): `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` em produção,
`Max-Age` = `SESSION_IDLE_MINUTES × 60`. Gravado no login e em cada renovação; apagado no logout e quando a renovação
falha com 401.

---

## `POST /api/v1/auth/login` — Entrar

| | |
| --- | --- |
| Limite | 20 requisições / 15 min por IP (`loginRateLimit`) + bloqueio por conta |
| Validador | `login-validator` |
| Controller / Service | `auth-controller.login` → `auth-service.login` → `user-repository.findByEmail`, `session-repository.create` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `email` | texto | sim | Formato de e-mail |
| `password` | texto | sim | Não vazio, até 128 caracteres |

**Resposta 200** (+ `Set-Cookie: patas_refresh=…`):

```json
{ "data": { "token": "<JWT de acesso>", "user": { "id": "…", "nome": "Carla Admin", "email": "carla@exemplo.org",
  "cargo": "administrador", "permissions": ["dashboard:read", "animals:read", "…"] } }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 401 | `CREDENCIAIS_INVALIDAS` | E-mail inexistente, senha errada, usuário inativo ou cargo sem permissões (mesma resposta em todos os casos) |
| 429 | `LOGIN_BLOQUEADO` | 5 falhas seguidas para o e-mail digitado; bloqueio de 15 min, dobrando a cada novo bloqueio até 4 h |
| 422 | `VALIDACAO_INVALIDA` | E-mail vazio após `trim` ou senha vazia (verificação do serviço) |

**Regras:** e-mail normalizado (minúsculas, sem espaços). Quando o usuário não existe, a senha é comparada com um hash
fictício, para o tempo de resposta não revelar quais e-mails existem. Sucesso zera as falhas e cria uma linha em
`sessoes` (agente do navegador até 500 caracteres; `expira_em` = login + `SESSION_MAX_HOURS`). O token de acesso leva
`sub`, `email`, `role`, `nome`, `sid` e vale `JWT_EXPIRES_IN` (15 min); o de renovação leva `sub`, `typ: "refresh"`,
`auth_time` e `sid` e vale `SESSION_IDLE_MINUTES`.

---

## `POST /api/v1/auth/refresh` — Renovar o token de acesso

| | |
| --- | --- |
| Cabeçalho obrigatório | `X-Requested-With: XMLHttpRequest` (middleware `csrf.js`) |
| Entrada | Cookie `patas_refresh` |
| Controller / Service | `auth-controller.refresh` → `auth-service.refresh` |

**Resposta 200:** mesmo formato do login, com novo cookie (rotação).

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 403 | `CSRF_INVALIDO` | Sem o cabeçalho `X-Requested-With` |
| 401 | `SESSAO_EXPIRADA` | Cookie ausente/inválido/expirado, sem `typ: refresh`/`sid`/`auth_time`, passou de `SESSION_MAX_HOURS` desde o login, ou sessão revogada/expirada/de outro usuário |
| 401 | `SESSAO_INVALIDA` | Usuário inativo ou sem permissões |

Em qualquer 401 o cookie é apagado. **Regras:** atualiza `sessoes.ultimo_uso_em`; o novo token de renovação mantém o
`auth_time` original (o limite absoluto não é renovado).

---

## `POST /api/v1/auth/logout` — Sair

| | |
| --- | --- |
| Cabeçalho obrigatório | `X-Requested-With: XMLHttpRequest` |
| Controller / Service | `auth-controller.logout` → `auth-service.logout` → `session-repository.revoke` |

**Resposta 204** (sem corpo; apaga o cookie). Único erro específico: 403 `CSRF_INVALIDO`.

**Regras:** se o cookie for um token de renovação válido (mesmo expirado), a sessão é revogada no banco — o token de
acesso dela deixa de valer na hora. Cookie inválido não é erro: o logout sempre conclui.

---

## `POST /api/v1/auth/forgot-password` — Esqueci minha senha

| | |
| --- | --- |
| Limite | 10 / 15 min por IP (compartilhado com `reset-password`) |
| Validador | `password-reset-validators.validateForgotPassword` (`email`: formato, até 150) |
| Controller / Service | `auth-controller.forgotPassword` → `auth-service.requestPasswordReset` → `access-link-service.send` |

**Resposta 202** (sempre a mesma):

```json
{ "data": { "mensagem": "Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha." }, "meta": {} }
```

**Regras:** só usuários ativos com permissões recebem o link. O envio roda em segundo plano (a resposta não espera
e o tempo não revela se o e-mail existe). Link: `<FRONTEND_URL>/admin/redefinir-senha?token=<token>`, válido por 1 h,
uso único; gerar um link invalida os anteriores do usuário; só o hash SHA-256 do token vai para o banco. Sem SMTP,
nenhum link é criado e o log registra `email_redefinicao_nao_enviado`.

---

## `POST /api/v1/auth/reset-password` — Definir nova senha pelo link

| | |
| --- | --- |
| Limite | 10 / 15 min por IP (compartilhado) |
| Validador | `validateResetPassword` |
| Controller / Service | `auth-controller.resetPassword` → `auth-service.resetPassword` → `access-link-service.consume` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `token` | texto | sim | 20–200 caracteres |
| `nova_senha` | texto | sim | 1–128 no validador; política de senha no serviço |

**Resposta 200:**

```json
{ "data": { "mensagem": "Senha definida. Entre com a nova senha." }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 422 | `SENHA_FRACA` | Menos de 10 caracteres, sem letra, sem número ou acima de 72 bytes (um item de `details` por problema) |
| 400 | `LINK_INVALIDO` | Token desconhecido, usado, expirado ou de usuário inativo |

**Regras:** serve para os links de redefinição e de convite. Numa transação: trava o link (`FOR UPDATE`), marca todos os
links pendentes do usuário como usados, grava a nova senha (bcrypt, 12 rodadas) e encerra **todas** as sessões do usuário.

---

## `GET /api/v1/me` — Usuário logado

| | |
| --- | --- |
| Autenticação | Bearer (sem permissão específica) |
| Controller / Service | `auth-controller.me` → `auth-service.getCurrentUser` |

**Resposta 200:**

```json
{ "data": { "id": "…", "nome": "Carla Admin", "email": "carla@exemplo.org", "cargo": "administrador",
  "permissions": ["dashboard:read", "…"] }, "meta": {} }
```

**Erros específicos:** 401 `SESSAO_INVALIDA` (usuário inativo ou sem permissões). Usado pelo painel para montar menu,
rotas e botões a partir de `permissions`.

---

## `PATCH /api/v1/me/password` — Trocar a própria senha

| | |
| --- | --- |
| Autenticação | Bearer |
| Validador | `change-password-validator` |
| Controller / Service | `auth-controller.changePassword` → `auth-service.changeOwnPassword` + `audit-service.record` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `senha_atual` | texto | sim | 1–128 |
| `nova_senha` | texto | sim | 1–128; política de senha e diferente da atual |

**Resposta 204** (sem corpo).

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 422 | `SENHA_ATUAL_INCORRETA` | `senha_atual` não confere |
| 422 | `SENHA_FRACA` | Política não atendida ou nova senha igual à atual |
| 401 | `SESSAO_INVALIDA` | Usuário inexistente ou inativo |

**Regras:** encerra as outras sessões do usuário e mantém a atual. Auditoria `alterar_propria_senha` (módulo `team`).
