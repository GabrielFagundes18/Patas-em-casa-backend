# Animais (`/api/v1/animals`)

Rotas: `src/modules/animals/animal-routes.js` (todas com `requireAuth`). Service: `animal-service.js`;
regras de status: `animal-status-rules.js`; SQL: `animal-repository.js` e `animal-media-repository.js`.

**Objeto animal (painel):**

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | UUID | |
| `nome` | texto | até 100 |
| `especie` | `cachorro` \| `gato` \| `outro` | |
| `raca` | texto \| null | até 100 |
| `sexo` | `macho` \| `femea` \| null | |
| `idade_anos` | texto decimal \| null | `numeric(4,1)` do banco, ex.: `"2.0"` |
| `porte` | `pequeno` \| `medio` \| `grande` \| null | |
| `status` | `disponivel` \| `em_processo` \| `adotado` \| `urgente` \| `inativo` | |
| `descricao` | texto \| null | até 10.000 |
| `foto_url` | texto \| null | URL da foto principal |
| `data_entrada` | `AAAA-MM-DD` | |
| `castrado`, `vacinado` | booleano | |
| `temperamento` | lista de texto | até 10 traços |
| `criado_em`, `atualizado_em` | data-hora | `atualizado_em` mantido por gatilho do banco |
| `fotos` | lista | só no detalhe e nas rotas de foto: `{ id, url, principal, ordem }` |

---

## `GET /api/v1/animals` — Listar

| | |
| --- | --- |
| Permissão | `animals:read` |
| Validador | `validateListAnimals` |
| Controller / Service | `animal-controller.list` → `animal-service.list` → `animal-repository.list` |

**Query:** igual a [`GET /public/animals`](publico.md#get-apiv1publicanimals--animais-disponíveis-para-adoção),
com a diferença de que `status` **filtra** (qualquer status). Padrão: `data_entrada` decrescente, nulos por último.

**Resposta 200:** lista paginada de objetos animal (sem `fotos`).

---

## `GET /api/v1/animals/export` — Exportar CSV

| | |
| --- | --- |
| Permissão | `animals:export` |
| Validador | `validateListAnimals` (mesmos filtros da listagem) |
| Controller / Service | `animal-controller.exportCsv` → `animal-service.listForExport` |

**Resposta 200:** `text/csv; charset=utf-8`, anexo `animais-AAAA-MM-DD.csv`, separador `;`, BOM UTF-8, linhas CRLF.
Colunas: ID; Nome; Espécie; Raça; Sexo; Idade (anos) (`2,00`); Porte; Status; Castrado (`sim`/`não`); Vacinado; Data de entrada.

**Erros específicos:** 422 `EXPORTACAO_MUITO_GRANDE` (mais de 10.000 linhas). Células iniciadas por `=`, `+`, `-`,
`@`, tabulação ou retorno ganham um apóstrofo (contra injeção de fórmulas). Esta exportação **não** gera auditoria.

---

## `POST /api/v1/animals` — Cadastrar

| | |
| --- | --- |
| Permissão | `animals:create` |
| Validador | `validateCreateAnimal` |
| Controller / Service | `animal-controller.create` → `animal-service.create` |

**Body:**

| Campo | Tipo | Obrigatório | Validação / padrão |
| --- | --- | --- | --- |
| `nome` | texto | sim | 1–100 após `trim` |
| `especie` | texto | sim | `cachorro`, `gato`, `outro` |
| `raca` | texto \| null | não | até 100 |
| `sexo` | texto \| null | não | `macho`, `femea` |
| `idade_anos` | número \| null | não | 0 a 999,9 |
| `porte` | texto \| null | não | `pequeno`, `medio`, `grande` |
| `status` | texto | não | um status válido; padrão `disponivel` |
| `descricao` | texto \| null | não | até 10.000 |
| `foto_url` | texto \| null | não | até 2048 (sem checagem de formato de URL) |
| `data_entrada` | texto | não | `AAAA-MM-DD` válido; padrão: data atual (UTC) |
| `castrado`, `vacinado` | booleano | não | padrão `false` |
| `temperamento` | lista de texto | não | até 10 itens, cada um com 1–40 caracteres |

**Resposta 201:** o objeto animal criado.

**Erros específicos:** 403 `TRANSICAO_NAO_PERMITIDA` (cadastrar já `adotado` sem ser administrador).

**Regras:** temperamento normalizado (sem vazios e sem repetidos, na ordem informada). Auditoria `criar`.
⚠️ A confirmar: a data padrão vem de `new Date().toISOString()` (UTC); entre 21h e 0h no horário de Brasília, ela cai no dia seguinte.

---

## `PATCH /api/v1/animals/:id/status` — Mudar o status

| | |
| --- | --- |
| Permissão | `animals:update` |
| Validador | `validateIdParam` + `validateAnimalStatus` |
| Controller / Service | `animal-controller.updateStatus` → `animal-service.changeStatus` → `update` |

**Body:** `status` (obrigatório, um status válido) e `motivo` (texto até 500, exigido em algumas transições).
Outros campos do corpo são ignorados.

**Resposta 200:** o objeto animal atualizado.

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 404 | `ANIMAL_NAO_ENCONTRADO` | |
| 409 | `TRANSICAO_INVALIDA` | Transição fora da máquina de estados (`details` lista os destinos permitidos) |
| 403 | `TRANSICAO_NAO_PERMITIDA` | `em_processo → adotado` ou `adotado → disponivel` sem ser administrador |
| 422 | `MOTIVO_OBRIGATORIO` | Ir para `inativo` ou `adotado → disponivel` sem motivo de ao menos 5 caracteres |

**Máquina de estados** (`animal-status-rules.js`):

| De | Para |
| --- | --- |
| `disponivel` | `urgente`, `em_processo`, `inativo` |
| `urgente` | `disponivel`, `em_processo`, `inativo` |
| `em_processo` | `disponivel`, `urgente`, `adotado`*, `inativo` |
| `adotado` | `disponivel`* (devolução, com motivo) |
| `inativo` | `disponivel`, `urgente` |

\* Só administrador. Auditoria `alterar_status` com antes/depois e o motivo.

---

## `GET /api/v1/animals/:id` — Detalhe

| | |
| --- | --- |
| Permissão | `animals:read` |
| Controller / Service | `animal-controller.getById` → `animal-service.getDetail` |

**Resposta 200:** objeto animal com `fotos` (`{ id, url, principal, ordem }`, principal primeiro). Erro: 404 `ANIMAL_NAO_ENCONTRADO`.

---

## `PUT /api/v1/animals/:id` — Editar

| | |
| --- | --- |
| Permissão | `animals:update` |
| Validador | `validateIdParam` + `validateUpdateAnimal` |
| Controller / Service | `animal-controller.update` → `animal-service.update` |

**Body:** os mesmos campos do cadastro, **todos opcionais** (atualização parcial, apesar do método PUT), mais `motivo`
(até 500). É preciso enviar ao menos um campo editável (senão 422, `field: "body"`). `especie` não aceita `null`;
`sexo` e `porte` aceitam. `idade_anos: ""` vira `null`; `raca` vazia vira `null`.

**Resposta 200:** o objeto animal (sem `fotos`).

**Erros específicos:** os mesmos de "Mudar o status" quando `status` muda.

**Regras:** só os campos que de fato mudaram entram na auditoria (`editar`, ou `alterar_status` se o status mudou).

---

## `DELETE /api/v1/animals/:id` — Excluir

| | |
| --- | --- |
| Permissão | `animals:delete` |
| Controller / Service | `animal-controller.remove` → `animal-service.remove` |

**Resposta 204.**

**Erros específicos:** 404 `ANIMAL_NAO_ENCONTRADO`; 409 `ANIMAL_COM_PEDIDO` (há pedidos de adoção — FK `RESTRICT`).

**Regras:** remoção física. As linhas de `animais_midias` saem por `ON DELETE CASCADE`; os arquivos das fotos são
apagados do disco depois; histórias vinculadas ficam com `animal_id = NULL`. Auditoria `excluir` com os dados anteriores.

---

## `POST /api/v1/animals/:id/photos` — Enviar fotos

| | |
| --- | --- |
| Permissão | `animals:update` |
| Formato | `multipart/form-data`, campo `fotos` (até 10 arquivos de até 5 MB) |
| Middlewares | `validateIdParam` + `upload.receivePhotos` (multer em memória) |
| Controller / Service | `animal-controller.addPhotos` → `animal-service.addPhotos` → `photo-storage.save` |

**Resposta 201:** o animal com `fotos`.

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 404 | `ANIMAL_NAO_ENCONTRADO` | |
| 422 | `ARQUIVO_INVALIDO` | Arquivo acima de 5 MB, mais de 10 arquivos, campo diferente de `fotos`, nenhum arquivo, ou conteúdo que não é JPG/PNG/WebP |
| 422 | `LIMITE_DE_FOTOS` | O animal passaria de 12 fotos (`details` informa quantas restam) |

**Regras:** o tipo é detectado pelo conteúdo (assinatura do arquivo), não pelo nome; **todos** os arquivos são
conferidos antes de gravar qualquer um. Cada foto vira `UPLOAD_DIR/animais/<uuid>.<ext>` e uma linha em
`animais_midias`. Se o animal não tinha foto principal, a primeira enviada vira principal e define `foto_url`.
Auditoria `adicionar_fotos` com a quantidade.

---

## `PATCH /api/v1/animals/:id/photos/:photoId/principal` — Definir foto principal

| | |
| --- | --- |
| Permissão | `animals:update` |
| Validador | `validatePhotoParams` (os dois ids UUID; erro em `field: "id"`) |
| Controller / Service | `animal-controller.setPrincipalPhoto` → `animal-service.setPrincipalPhoto` |

**Resposta 200:** o animal com `fotos`. **Erros:** 404 `ANIMAL_NAO_ENCONTRADO`; 404 `FOTO_NAO_ENCONTRADA` (foto de outro animal ou inexistente).

**Regras:** desmarca a principal atual, marca a nova e atualiza `foto_url`. Auditoria `definir_foto_principal`.

---

## `DELETE /api/v1/animals/:id/photos/:photoId` — Remover foto

| | |
| --- | --- |
| Permissão | `animals:update` |
| Validador | `validatePhotoParams` |
| Controller / Service | `animal-controller.removePhoto` → `animal-service.removePhoto` |

**Resposta 200** (não 204): o animal com as `fotos` restantes. **Erros:** os mesmos da rota anterior.

**Regras:** apaga a linha e o arquivo. Se era a principal, a próxima foto vira principal e define `foto_url`; sem
fotos, `foto_url` é limpo se apontava para a foto removida. Auditoria `remover_foto`.
