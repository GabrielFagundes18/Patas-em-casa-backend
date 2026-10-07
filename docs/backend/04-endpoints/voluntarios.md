# Voluntários (`/api/v1/volunteers`)

Rotas: `src/modules/volunteers/volunteer-routes.js` (todas com `requireAuth`). Service: `volunteer-service.js`;
SQL: `volunteer-repository.js`. A inscrição pelo site está em
[`POST /public/volunteers`](publico.md#post-apiv1publicvolunteers--inscrição-de-voluntário).

**Objeto voluntário:**

```json
{ "id": "…", "nome": "Ana Souza", "email": "ana@email.com", "telefone": "(11) 98888-7777", "status": "ativo",
  "data_inicio": "2026-10-07", "criado_em": "…", "areas": ["fotografia", "passeios"] }
```

`areas` em ordem alfabética. E-mail e telefone saem completos (sem máscara) para quem tem `volunteers:read`.
Áreas válidas: `passeios`, `banho_e_tosa`, `divulgacao`, `eventos`, `transporte`, `fotografia`, `socializacao`,
`captacao`, `manutencao`.

---

## `GET /api/v1/volunteers` — Listar

| | |
| --- | --- |
| Permissão | `volunteers:read` |
| Validador | `validateListVolunteers` |
| Controller / Service | `volunteer-controller.list` → `volunteer-service.list` → `volunteer-repository.list` |

**Query:** `page`, `pageSize`; `q` (nome **ou** e-mail); `status` (`ativo`, `inativo`); `area` (uma área);
`sort` (`nome` — padrão —, `criado_em`, `data_inicio`, `status`); `order` (padrão **`asc`**).

**Resposta 200:** lista paginada de voluntários.

---

## `GET /api/v1/volunteers/:id` — Detalhe

| | |
| --- | --- |
| Permissão | `volunteers:read` |
| Controller / Service | `volunteer-controller.getById` → `volunteer-service.getById` |

**Resposta 200:** objeto voluntário. **Erro:** 404 `VOLUNTARIO_NAO_ENCONTRADO`.

---

## `POST /api/v1/volunteers` — Cadastrar

| | |
| --- | --- |
| Permissão | `volunteers:create` |
| Validador | `validateCreateVolunteer` |
| Controller / Service | `volunteer-controller.create` → `volunteer-service.create` |

**Body:**

| Campo | Tipo | Obrigatório | Validação / padrão |
| --- | --- | --- | --- |
| `nome` | texto | sim | 2–150 |
| `email` | texto | sim | Formato de e-mail, até 150 |
| `telefone` | texto \| null \| `""` | não | Só dígitos, espaço, `()+-`; 10–13 dígitos; até 20 |
| `status` | texto | não | `ativo` (padrão) ou `inativo` |
| `areas` | lista | não | Áreas válidas (pode ser vazia) |
| `data_inicio` | `AAAA-MM-DD` \| null | não | Data válida; padrão: data atual |

**Resposta 201:** objeto voluntário. **Erro específico:** 409 `EMAIL_EM_USO`.

**Regras:** transação (voluntário + áreas). Nome com `trim`, e-mail em minúsculas, áreas sem repetição. Auditoria `criar`.

---

## `PATCH /api/v1/volunteers/:id` — Editar

| | |
| --- | --- |
| Permissão | `volunteers:update` |
| Validador | `validateIdParam` + `validateUpdateVolunteer` |
| Controller / Service | `volunteer-controller.update` → `volunteer-service.update` |

**Body:** os mesmos campos do cadastro, opcionais (ao menos um). `areas`, quando enviada, **substitui** todas as áreas.

**Resposta 200:** objeto voluntário. **Erros:** 404 `VOLUNTARIO_NAO_ENCONTRADO`; 409 `EMAIL_EM_USO`.

**Regras:** transação; auditoria `editar` com os campos alterados (incluindo áreas). ⚠️ A confirmar: `nome: null` e
`data_inicio: null` passam no validador, mas as colunas são `NOT NULL`; pela leitura do código, resultam em 500.

---

## `DELETE /api/v1/volunteers/:id` — Excluir

| | |
| --- | --- |
| Permissão | `volunteers:delete` |
| Controller / Service | `volunteer-controller.remove` → `volunteer-service.remove` |

**Resposta 204.** **Erro:** 404 `VOLUNTARIO_NAO_ENCONTRADO`.

**Regras:** remoção física; as áreas saem por `ON DELETE CASCADE`. Auditoria `excluir` com nome e status anteriores.
