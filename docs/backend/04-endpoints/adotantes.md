# Adotantes e LGPD (`/api/v1/adopters`)

Rotas: `src/modules/adopters/adopter-routes.js` (todas com `requireAuth`). Service: `adopter-service.js`; SQL:
`adopter-repository.js`. Adotantes são criados pelo pedido de adoção do site; não há rota de cadastro manual.

**Objeto adotante (mascarado, padrão):**

```json
{ "id": "…", "nome": "Ana Souza", "email": "an***@email.com", "telefone": "*******7777", "cidade": "Campinas",
  "estado": "SP", "status": "em_analise", "criado_em": "…", "possui_endereco": true,
  "total_pedidos": 2, "pedidos_abertos": 1 }
```

`total_pedidos` e `pedidos_abertos` só aparecem na listagem. O endereço nunca sai mascarado: sai omitido
(`possui_endereco` indica se existe). Regra de máscara: e-mail mantém até 2 caracteres antes do `@`; telefone mantém
os 4 últimos dígitos (`src/utils/masking.js`).

---

## `GET /api/v1/adopters` — Listar

| | |
| --- | --- |
| Permissão | `adopters:read` |
| Validador | `validateListAdopters` |
| Controller / Service | `adopter-controller.list` → `adopter-service.list` → `adopter-repository.list` |

**Query:**

| Parâmetro | Regra |
| --- | --- |
| `page`, `pageSize` | Paginação |
| `q` | Texto até 120: busca em nome **ou** e-mail; com 4+ dígitos, também nos dígitos do telefone |
| `status` | `em_analise`, `visita_agendada`, `adotante`, `inativo` |
| `cidade` | Até 100; comparação `ILIKE` com o valor informado (sem curinga: igualdade sem diferenciar maiúsculas) |
| `estado` | Duas letras maiúsculas (ex.: `SP`) |
| `sort` | `nome`, `criado_em` (padrão), `cidade`, `status` |
| `order` | `asc` / `desc` (padrão `desc`) |

**Resposta 200:** lista paginada de adotantes mascarados.

---

## `GET /api/v1/adopters/export` — Exportar CSV

| | |
| --- | --- |
| Permissão | `adopters:export` |
| Validador | `validateListAdopters` |
| Controller / Service | `adopter-controller.exportCsv` → `adopter-service.listForExport` |

**Resposta 200:** CSV `adotantes-AAAA-MM-DD.csv` (`;`, BOM, CRLF), ordenado por nome. Colunas: ID; Nome; E-mail;
Telefone; Cidade; UF; Status; Pedidos; Pedidos em andamento; Cadastro (`AAAA-MM-DD`).

**Regras:** quem também tem `adopters:reveal` recebe e-mail e telefone completos; os demais, mascarados. Auditoria
`exportar` ou `exportar_com_contatos`, com a quantidade de linhas. Erro: 422 `EXPORTACAO_MUITO_GRANDE` (mais de 10.000).

---

## `GET /api/v1/adopters/:id` — Detalhe com histórico

| | |
| --- | --- |
| Permissão | `adopters:read` |
| Controller / Service | `adopter-controller.getById` → `adopter-service.getById` (+ `findHistory`) |

**Resposta 200:**

```json
{ "data": { "id": "…", "nome": "Ana Souza", "email": "an***@email.com", "telefone": "*******7777", "cidade": "Campinas",
  "estado": "SP", "status": "adotante", "criado_em": "…", "possui_endereco": false,
  "historico": {
    "pedidos": [ { "id": "…", "status": "aprovado", "prioridade": "medio", "observacoes": "texto com contatos mascarados",
      "termo_assinado": true, "termo_assinado_em": "…", "data_pedido": "…", "atualizado_em": "…",
      "animal_id": "…", "animal_nome": "Mel", "animal_especie": "gato" } ],
    "doacoes": [ { "id": "…", "doador_nome": "Ana Souza", "doador_email": "an***@email.com", "tipo": "unica",
      "valor": "50.00", "metodo": "pix", "status": "confirmada", "data": "…" } ],
    "historias": [ { "id": "…", "animal_id": "…", "autor_nome": "Ana Souza", "texto": "…", "foto_url": null, "publicado": true, "criado_em": "…" } ]
  } }, "meta": {} }
```

Neste histórico, `valor` das doações sai como texto decimal (sem conversão). **Erro:** 404 `ADOTANTE_NAO_ENCONTRADO`.

---

## `POST /api/v1/adopters/:id/reveal` — Revelar contatos

| | |
| --- | --- |
| Permissão | `adopters:reveal` |
| Controller / Service | `adopter-controller.reveal` → `adopter-service.reveal` |

**Resposta 200:** `{ "data": { "id": "…", "email": "ana@email.com", "telefone": "(11) 98888-7777", "endereco": "Rua …" }, "meta": {} }`

**Erro:** 404 `ADOTANTE_NAO_ENCONTRADO`. **Regras:** auditoria `revelar_contato`.

---

## `PATCH /api/v1/adopters/:id` — Editar

| | |
| --- | --- |
| Permissão | `adopters:update` |
| Validador | `validateIdParam` + `validateUpdateAdopter` |
| Controller / Service | `adopter-controller.update` → `adopter-service.update` |

**Body** (ao menos um campo):

| Campo | Tipo | Validação |
| --- | --- | --- |
| `nome` | texto | 2–150 |
| `email` | texto | Formato de e-mail, até 150 |
| `telefone` | texto \| null | Só dígitos, espaço, `()+-`; 10–13 dígitos; até 20 |
| `cidade` | texto | 2–100 |
| `estado` | texto \| null | Duas letras maiúsculas |
| `endereco` | texto | 5–500 |
| `status` | texto | `em_analise`, `visita_agendada`, `adotante`, `inativo` |

**Resposta 200:** adotante mascarado (sem contagens).

**Erros específicos:** 404 `ADOTANTE_NAO_ENCONTRADO`; 409 `EMAIL_EM_USO`.

**Regras:** textos com `trim`; texto vazio vira `null`; e-mail em minúsculas. Auditoria `editar` com os campos alterados
(antes/depois — inclusive contatos). ⚠️ A confirmar: `nome: null` passa no validador (campo opcional aceita `null`),
mas a coluna é `NOT NULL`; pela leitura do código, isso resulta em 500.

---

## `GET /api/v1/adopters/:id/lgpd-export` — Exportar dados do titular (LGPD)

| | |
| --- | --- |
| Permissão | `lgpd:approve` (só administrador) |
| Controller / Service | `adopter-controller.exportTitularData` → `adopter-service.exportTitularData` |

**Resposta 200:** JSON com `Content-Disposition: attachment; filename="dados-titular-<id>.json"`:

```json
{ "data": { "gerado_em": "…", "titular": { "id": "…", "nome": "…", "email": "…", "telefone": "…", "cidade": "…",
  "estado": "…", "endereco": "…", "status": "…", "criado_em": "…" },
  "pedidos_adocao": [ ], "doacoes": [ ], "historias": [ ] }, "meta": {} }
```

Tudo **sem máscara** (direito de acesso/portabilidade). **Erro:** 404. **Regras:** auditoria `lgpd_exportar` (módulo `lgpd`).

---

## `POST /api/v1/adopters/:id/anonymize` — Anonimizar titular (irreversível)

| | |
| --- | --- |
| Permissão | `lgpd:approve` |
| Validador | `validateIdParam` + `validateConfirmation('ANONIMIZAR')` |
| Controller / Service | `adopter-controller.anonymize` → `adopter-service.anonymize` |

**Body:** `{ "confirmacao": "ANONIMIZAR" }` (exatamente esse texto; senão 422 em `confirmacao`).

**Resposta 200:** `{ "data": { "id": "…", "anonimizado": true }, "meta": {} }`

**Erros específicos:** 404 `ADOTANTE_NAO_ENCONTRADO`; 409 `TITULAR_JA_ANONIMIZADO`; 409 `PEDIDOS_EM_ANDAMENTO`.

**Regras** (uma transação, com o adotante travado): exige nenhum pedido aberto. Nas doações vinculadas, nome vira
"Doador anonimizado" e e-mail `null`; nas histórias, autor vira "Autor anonimizado" e `publicado = false`; nos pedidos,
`observacoes` vira "[conteúdo removido a pedido do titular (LGPD)]". O adotante vira "Titular anonimizado", e-mail
`anonimizado-<id>@anonimizado.invalid`, telefone/cidade/estado/endereço `null` e status `inativo`. Pedidos, doações e
estatísticas permanecem. Auditoria `lgpd_anonimizar` **sem** os valores antigos.

---

## `DELETE /api/v1/adopters/:id` — Excluir titular (irreversível)

| | |
| --- | --- |
| Permissão | `lgpd:approve` |
| Validador | `validateIdParam` + `validateConfirmation('EXCLUIR')` (corpo na requisição DELETE) |
| Controller / Service | `adopter-controller.remove` → `adopter-service.remove` |

**Body:** `{ "confirmacao": "EXCLUIR" }`. **Resposta 204.**

**Erros específicos:** os mesmos da anonimização.

**Regras:** limpa os dados pessoais das doações, histórias e pedidos vinculados (como na anonimização) e apaga o
adotante. Pelas chaves estrangeiras: os **pedidos de adoção do titular são apagados** (`ON DELETE CASCADE`, junto com
os agendamentos deles); doações e histórias ficam com `adotante_id = NULL`. Auditoria `lgpd_excluir`.
