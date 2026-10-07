# Histórias de adoção (`/api/v1/stories`)

Rotas: `src/modules/stories/story-routes.js` (todas com `requireAuth`). Service: `story-service.js`;
SQL: `story-repository.js`. A listagem pública está em
[`GET /public/stories`](publico.md#get-apiv1publicstories--histórias-publicadas).

**Objeto história (painel):**

```json
{ "id": "…", "autor_nome": "Fernanda A.", "texto": "A Pipoca mudou nossa rotina.", "foto_url": null, "publicado": true,
  "criado_em": "…", "animal_id": "…", "animal_nome": "Pipoca", "adotante_id": null, "adotante_nome": null }
```

---

## `GET /api/v1/stories` — Listar

| | |
| --- | --- |
| Permissão | `stories:read` |
| Validador | `validateListStories` |
| Controller / Service | `story-controller.list` → `story-service.list` → `story-repository.list` |

**Query:** `page`, `pageSize`; `q` (autor **ou** texto); `publicado` (`true`/`false`); `animal_id` (UUID);
`sort` (só `criado_em`); `order` (padrão `desc`).

**Resposta 200:** lista paginada de histórias.

---

## `GET /api/v1/stories/:id` — Detalhe

| | |
| --- | --- |
| Permissão | `stories:read` |
| Controller / Service | `story-controller.getById` → `story-service.getById` |

**Resposta 200:** objeto história. **Erro:** 404 `HISTORIA_NAO_ENCONTRADA`.

---

## `POST /api/v1/stories` — Cadastrar

| | |
| --- | --- |
| Permissão | `stories:create` |
| Validador | `validateCreateStory` |
| Controller / Service | `story-controller.create` → `story-service.create` |

**Body:**

| Campo | Tipo | Obrigatório | Validação / padrão |
| --- | --- | --- | --- |
| `autor_nome` | texto | sim | 2–150 |
| `texto` | texto | sim | 10–5000 |
| `foto_url` | texto \| null \| `""` | não | URL http(s), até 2048 |
| `publicado` | booleano | não | padrão `false` |
| `animal_id` | UUID \| null \| `""` | não | Animal vinculado |
| `adotante_id` | UUID \| null \| `""` | não | Adotante vinculado |

**Resposta 201:** objeto história. **Erro específico:** 422 `VINCULO_INVALIDO` (animal ou adotante inexistente).

**Regras:** textos com `trim`; vazios em `foto_url`/`animal_id`/`adotante_id` viram `null`. Auditoria `criar` (com `publicado`).

---

## `PATCH /api/v1/stories/:id` — Editar, publicar ou despublicar

| | |
| --- | --- |
| Permissão | `stories:update` |
| Validador | `validateIdParam` + `validateUpdateStory` |
| Controller / Service | `story-controller.update` → `story-service.update` |

**Body:** os mesmos campos do cadastro, opcionais (ao menos um).

**Resposta 200:** objeto história. **Erros:** 404 `HISTORIA_NAO_ENCONTRADA`; 422 `VINCULO_INVALIDO`.

**Regras:** auditoria `publicar`, `despublicar` (quando `publicado` muda) ou `editar`, só com os campos alterados.
⚠️ A confirmar: `autor_nome: null` ou `texto: null` passam no validador, mas as colunas são `NOT NULL`; pela leitura do
código, resultam em 500.

---

## `DELETE /api/v1/stories/:id` — Excluir

| | |
| --- | --- |
| Permissão | `stories:delete` |
| Controller / Service | `story-controller.remove` → `story-service.remove` |

**Resposta 204.** **Erro:** 404 `HISTORIA_NAO_ENCONTRADA`. **Regras:** remoção física; auditoria `excluir`.
