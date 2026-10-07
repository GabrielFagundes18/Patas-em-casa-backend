# Equipe e acessos (`/api/v1/users`) e matriz de permissões (`/api/v1/permissions`)

Rotas: `src/modules/users/user-routes.js` (todas com `requireAuth`) e `src/modules/permissions/permission-routes.js`.
Service: `user-service.js`; SQL: `user-repository.js`. Pela matriz atual, só o cargo `administrador` tem `team:*`.

**Objeto usuário:**

```json
{ "id": "…", "nome": "Carla Admin", "email": "carla@exemplo.org", "cargo": "administrador", "ativo": true,
  "criado_em": "…", "permissions": ["dashboard:read", "animals:read", "…"] }
```

O hash da senha nunca sai. Cargos: `administrador`, `gestor_ong`, `gestor_animais`, `financeiro`, `voluntariado`.

---

## `GET /api/v1/users` — Listar membros

| | |
| --- | --- |
| Permissão | `team:read` |
| Validador | `validateListUsers` |
| Controller / Service | `user-controller.list` → `user-service.list` → `user-repository.list` |

**Query:** `page`, `pageSize`; `q` (nome **ou** e-mail); `cargo`; `ativo` (`true`/`false`); `sort` (`nome` — padrão —,
`email`, `cargo`, `criado_em`); `order` (padrão **`asc`**).

**Resposta 200:** lista paginada de usuários.

---

## `POST /api/v1/users` — Adicionar membro

| | |
| --- | --- |
| Permissão | `team:create` |
| Validador | `validateCreateUser` |
| Controller / Service | `user-controller.create` → `user-service.create` (+ `access-link-service.send` no convite) |

**Body:**

| Campo | Tipo | Obrigatório | Validação / padrão |
| --- | --- | --- | --- |
| `nome` | texto | sim | 2–150 |
| `email` | texto | sim | Formato de e-mail, até 150 |
| `cargo` | texto | sim | Um dos cinco cargos |
| `senha` | texto | sim, **exceto** com `enviar_convite: true` | 1–128 no validador; política de senha no serviço |
| `enviar_convite` | booleano | não | `true` envia por e-mail um link para a pessoa criar a senha |
| `ativo` | booleano | não | padrão `true` |

**Resposta 201:**

```json
{ "data": { "id": "…", "nome": "Luiza", "email": "luiza@exemplo.org", "cargo": "voluntariado", "ativo": true,
  "criado_em": "…", "permissions": ["dashboard:read", "…"],
  "convite": { "enviado": false, "motivo": "O envio de e-mails não está configurado no servidor (SMTP)." } }, "meta": {} }
```

`convite` é `null` sem `enviar_convite`, `{ "enviado": true }` quando o e-mail saiu, ou `{ "enviado": false, "motivo": "…" }`.

**Erros específicos:** 422 `SENHA_FRACA`; 409 `EMAIL_EM_USO`.

**Regras:** nome com `trim`, e-mail em minúsculas, senha com bcrypt (12 rodadas). Com convite e sem senha, a conta
nasce com uma senha aleatória que ninguém conhece. O link do convite vale 72 h
(`<FRONTEND_URL>/admin/redefinir-senha?token=…&convite=1`) e invalida links anteriores. Auditoria `criar`.

---

## `GET /api/v1/users/:id` — Detalhe

| | |
| --- | --- |
| Permissão | `team:read` |
| Controller / Service | `user-controller.getById` → `user-service.getById` |

**Resposta 200:** objeto usuário. **Erro:** 404 `USUARIO_NAO_ENCONTRADO`.

---

## `PATCH /api/v1/users/:id` — Editar membro (cargo, situação, nome, e-mail)

| | |
| --- | --- |
| Permissão | `team:update` |
| Validador | `validateIdParam` + `validateUpdateUser` |
| Controller / Service | `user-controller.update` → `user-service.update` |

**Body** (ao menos um): `nome` (2–150), `email` (formato, até 150), `cargo` (um dos cinco), `ativo` (booleano).

**Resposta 200:** objeto usuário.

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 404 | `USUARIO_NAO_ENCONTRADO` | |
| 409 | `ALTERACAO_PROPRIA_BLOQUEADA` | A pessoa tenta mudar o próprio cargo ou desativar a própria conta |
| 409 | `ULTIMO_ADMINISTRADOR` | A mudança deixaria o sistema sem administrador ativo |
| 409 | `EMAIL_EM_USO` | E-mail de outro usuário |

**Regras:** desativar encerra todas as sessões do usuário na hora; mudança de cargo vale na próxima requisição (o
cargo é lido do banco a cada chamada). Auditoria `editar` com antes/depois dos campos alterados. ⚠️ A confirmar:
`nome: null` passa no validador e, pela leitura do código, resulta em 500 (`null.trim()`).

---

## `POST /api/v1/users/:id/password` — Definir nova senha de um membro

| | |
| --- | --- |
| Permissão | `team:update` |
| Validador | `validateIdParam` + `validateResetPassword` (`nova_senha`: 1–128) |
| Controller / Service | `user-controller.resetPassword` → `user-service.resetPassword` |

**Resposta 204.** **Erros:** 404 `USUARIO_NAO_ENCONTRADO`; 422 `SENHA_FRACA`.

**Regras:** política de senha, hash bcrypt, encerra **todas** as sessões do usuário. Auditoria `redefinir_senha`.
Não exige a senha atual (é uma ação administrativa).

---

## `POST /api/v1/users/:id/invite` — (Re)enviar convite

| | |
| --- | --- |
| Permissão | `team:update` |
| Validador | `validateIdParam` |
| Controller / Service | `user-controller.sendInvite` → `user-service.sendInvite` |

**Resposta 200:** `{ "data": { "enviado": true }, "meta": {} }` ou `{ "enviado": false, "motivo": "…" }`.

**Erros específicos:** 404 `USUARIO_NAO_ENCONTRADO`; 409 `USUARIO_INATIVO` (reative antes).

**Regras:** gera um link novo de 72 h e invalida os anteriores. Sem SMTP, nenhum link é criado e o motivo é devolvido.
Auditoria `enviar_convite` com `enviado`.

---

## `GET /api/v1/permissions` — Matriz de permissões

| | |
| --- | --- |
| Permissão | `team:read` |
| Controller | `user-controller.permissionMatrix` (síncrono) → `config/permissions.getPermissionMatrix` |

**Resposta 200:**

```json
{ "data": {
  "modules": [ { "module": "dashboard", "actions": ["read"] }, { "module": "animals", "actions": ["read", "create", "update", "delete", "export"] } ],
  "roles": [ { "role": "gestor_animais", "permissions": { "dashboard": ["read"], "animals": ["read", "create", "update", "export"] } } ]
}, "meta": {} }
```

A matriz completa está em [7. Autenticação e autorização](../07-autenticacao-autorizacao.md#papéis-e-permissões).
