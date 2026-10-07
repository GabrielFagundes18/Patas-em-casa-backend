# Pedidos de adoção — triagem e agenda (`/api/v1/adoption-requests`)

Rotas: `src/modules/adoptions/adoption-request-routes.js` (todas com `requireAuth`). Validadores:
`adoption-triage-validators.js`. Controller: `adoption-request-controller.js`. Service: `adoption-triage-service.js`.
SQL: `adoption-triage-repository.js` e `appointment-repository.js`. O pedido é criado pelo site em
[`POST /public/adoption-requests`](publico.md#post-apiv1publicadoption-requests--pedido-de-adoção-pelo-site).

## Objetos de resposta

**Resumo do pedido** (listas e quadro) — contatos do adotante **mascarados**:

```json
{
  "id": "…", "status": "em_analise", "prioridade": "alto", "termo_assinado": false, "termo_assinado_em": null,
  "data_pedido": "2026-10-01T15:00:00.000Z", "atualizado_em": "2026-10-02T10:00:00.000Z",
  "animal": { "id": "…", "nome": "Mel", "especie": "gato", "status": "disponivel", "foto_url": null },
  "adotante": { "id": "…", "nome": "Ana Souza", "cidade": "Campinas", "estado": null, "status": "em_analise",
    "email": "an***@email.com", "telefone": "*******7777" },
  "responsavel": { "id": "…", "nome": "Carla Admin" }
}
```

**Detalhe do pedido** = resumo + `observacoes` (histórico em texto, com e-mails e telefones mascarados dentro do
texto), `visita_preferida_em` (`AAAA-MM-DDTHH:mm` em Brasília, ou `null`) e `agendamentos` (mais recentes primeiro).

**Agendamento:**

```json
{ "id": "…", "tipo": "visita", "status": "agendado", "previsto_em": "2026-10-10T17:00:00.000Z",
  "data_hora": "2026-10-10T14:00", "duracao_minutos": 60, "local": "Sede da ONG", "mensagem": "Traga um documento.",
  "responsavel": { "id": "…", "nome": "Carla Admin" } }
```

**Resultado do e-mail** (campo `email` das ações que podem avisar o adotante): `null` quando não foi pedido;
`{ "enviado": true, "para": "an***@email.com" }`; ou `{ "enviado": false, "motivo": "O envio de e-mails não está configurado no servidor (SMTP)." }`
(ou "O servidor de e-mail recusou ou não respondeu ao envio.").

**Histórico (`observacoes`).** Anotações e ações entram no fim do texto como
`[dd/mm/aa hh:mm — Autor] texto` (horário de Brasília; autor = nome do usuário, "Equipe" ou "Sistema").

---

## `GET /api/v1/adoption-requests` — Listar

| | |
| --- | --- |
| Permissão | `adoptions:read` |
| Validador | `validateListRequests` |
| Controller / Service | `list` → `adoption-triage-service.list` → `adoption-triage-repository.list` |

**Query:**

| Parâmetro | Regra |
| --- | --- |
| `page`, `pageSize`, `q` | Paginação; `q` busca no nome do adotante **ou** do animal |
| `status` | Um ou mais status separados por vírgula (`novo`, `em_analise`, `visita_agendada`, `aprovado`, `reprovado`) |
| `prioridade` | `alto`, `medio`, `baixo` |
| `responsavel_id` | UUID, ou `nenhum` para pedidos sem responsável |
| `animal_id`, `adotante_id` | UUID |
| `de`, `ate` | `AAAA-MM-DD` (data do pedido; `ate` inclui o dia inteiro; `ate ≥ de`) |
| `sort` | `data_pedido` (padrão), `atualizado_em`, `status`, `prioridade` (alto → médio → baixo) |
| `order` | `asc` / `desc` (padrão `desc`) |

**Resposta 200:** lista paginada de resumos.

---

## `GET /api/v1/adoption-requests/board` — Quadro (kanban)

| | |
| --- | --- |
| Permissão | `adoptions:read` |
| Validador | `validateBoard` (`incluir_reprovados`: `true`/`false`) |
| Controller / Service | `board` → `adoption-triage-service.board` |

**Resposta 200:**

```json
{ "data": { "columns": [ { "status": "novo", "total": 7, "items": [ { "…": "resumo" } ] } ] }, "meta": {} }
```

**Regras:** uma coluna por status, na ordem `novo`, `em_analise`, `visita_agendada`, `aprovado` (e `reprovado` com
`incluir_reprovados=true`); até 50 itens por coluna, ordenados por prioridade e depois pelo pedido mais recente;
`total` é o total real da coluna.

---

## `GET /api/v1/adoption-requests/:id` — Detalhe

| | |
| --- | --- |
| Permissão | `adoptions:read` |
| Controller / Service | `getById` → `adoption-triage-service.getById` |

**Resposta 200:** detalhe do pedido. **Erro:** 404 `PEDIDO_NAO_ENCONTRADO`.

---

## `POST /api/v1/adoption-requests/:id/reveal` — Revelar contatos do pedido

| | |
| --- | --- |
| Permissão | `adopters:reveal` |
| Controller / Service | `reveal` → `adoption-triage-service.reveal` |

**Resposta 200:**

```json
{ "data": { "id": "…", "adotante": { "id": "…", "email": "ana@email.com", "telefone": "(11) 98888-7777" },
  "observacoes": "texto completo, sem máscara" }, "meta": {} }
```

**Erro:** 404 `PEDIDO_NAO_ENCONTRADO`. **Regras:** gera auditoria `revelar_dados_pedido` (módulo `adoptions`).

---

## `PATCH /api/v1/adoption-requests/:id` — Mover, priorizar, atribuir ou anotar

| | |
| --- | --- |
| Permissão | `adoptions:update` |
| Validador | `validateIdParam` + `validateUpdateRequest` |
| Controller / Service | `update` → `adoption-triage-service.update` |

**Body** (ao menos um campo):

| Campo | Tipo | Validação |
| --- | --- | --- |
| `status` | texto | Só `novo`, `em_analise`, `visita_agendada` (aprovar/reprovar têm rotas próprias) |
| `prioridade` | texto | `alto`, `medio`, `baixo` |
| `responsavel_id` | UUID \| null | `null` remove o responsável |
| `nota` | texto | 1–2000 |

**Resposta 200:** detalhe do pedido.

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 404 | `PEDIDO_NAO_ENCONTRADO` | |
| 409 | `PEDIDO_ENCERRADO` | Pedido `aprovado`/`reprovado` e o corpo tenta mudar status, prioridade ou responsável (anotação é permitida) |
| 422 | `RESPONSAVEL_INVALIDO` | Responsável inexistente, inativo ou sem `adoptions:update` |

**Regras:** transação com o pedido travado (`FOR UPDATE`). Ir para `visita_agendada` muda o adotante para
`visita_agendada` (se ele ainda não for `adotante`); sair de `visita_agendada` devolve o adotante para `em_analise`
(se ele estava em `visita_agendada`). Auditoria `mover_pedido` (quando o status muda) ou `editar`.

---

## `POST /api/v1/adoption-requests/:id/approve` — Aprovar

| | |
| --- | --- |
| Permissão | `adoptions:approve` |
| Validador | `validateIdParam` + `validateDecision` |
| Controller / Service | `approve` → `adoption-triage-service.approve` |

**Body:**

| Campo | Tipo | Obrigatório | Validação |
| --- | --- | --- | --- |
| `justificativa` | texto | sim | 10–2000 (interna, nunca vai ao adotante) |
| `notificar_adotante` | booleano | não | `true` envia o e-mail de decisão |
| `mensagem_adotante` | texto | não | até 1000 (vai no e-mail) |

**Resposta 200:** detalhe do pedido + `email` (resultado do envio ou `null`).

**Erros específicos:** 404 `PEDIDO_NAO_ENCONTRADO`; 409 `PEDIDO_ENCERRADO`; 409 `ANIMAL_JA_ADOTADO`; 409 `ANIMAL_INATIVO`.

**Regras** (uma transação, com pedido e animal travados):

1. o pedido vira `aprovado`, com a justificativa no histórico;
2. o animal vira `adotado` e o adotante, `adotante`;
3. todos os **outros pedidos abertos do mesmo animal** viram `reprovado` ("Reprovado automaticamente: o animal foi
   adotado em outro pedido."), com os agendamentos ativos cancelados e o adotante liberado (vira `inativo` se não tiver
   outro pedido aberto e estava `em_analise`/`visita_agendada`);
4. auditoria `aprovar` e uma `reprovar_automaticamente` por pedido afetado.

Depois de gravar, se `notificar_adotante` for `true`, envia o e-mail de aprovação e anota no histórico se saiu ou não.

---

## `POST /api/v1/adoption-requests/:id/reject` — Reprovar

| | |
| --- | --- |
| Permissão | `adoptions:approve` |
| Validador | `validateIdParam` + `validateDecision` (mesmo corpo da aprovação) |
| Controller / Service | `reject` → `adoption-triage-service.reject` |

**Resposta 200:** detalhe do pedido + `email`. **Erros:** 404 `PEDIDO_NAO_ENCONTRADO`; 409 `PEDIDO_ENCERRADO`.

**Regras** (uma transação): cancela os agendamentos ativos do pedido; o pedido vira `reprovado` com a justificativa (e
a quantidade de agendamentos cancelados) no histórico; se o animal estava `em_processo` e não restar outro pedido
aberto, o animal volta para `disponivel`; o adotante é liberado como na aprovação. Auditoria `reprovar`. E-mail opcional
depois de gravar (texto de "não aprovado", sem a justificativa).

---

## `POST /api/v1/adoption-requests/:id/schedule` — Agendar visita ou entrevista

| | |
| --- | --- |
| Permissão | `adoptions:update` |
| Validador | `validateIdParam` + `validateSchedule` |
| Controller / Service | `schedule` → `adoption-triage-service.schedule` → `appointment-repository` |

**Body:**

| Campo | Tipo | Obrigatório | Validação / padrão |
| --- | --- | --- | --- |
| `tipo` | texto | sim | `visita` ou `entrevista` |
| `data_hora` | texto | sim | `AAAA-MM-DDTHH:mm` (Brasília); no futuro |
| `duracao_minutos` | inteiro | não | 15–480; padrão 60 |
| `local` | texto | não | até 300 (local ou link) |
| `mensagem` | texto | não | até 1000 (vai ao adotante) |
| `enviar_email` | booleano | não | `true` avisa o adotante |
| `responsavel_id` | UUID \| null | não | Responsável pelo compromisso |

**Resposta 200:**

```json
{ "data": { "pedido": { "…": "detalhe" }, "agendamento": { "…": "agendamento" }, "email": null }, "meta": {} }
```

**Erros específicos:**

| Status | Código | Quando |
| --- | --- | --- |
| 422 | `DATA_NO_PASSADO` | `data_hora` não está no futuro |
| 404 | `PEDIDO_NAO_ENCONTRADO` | |
| 409 | `PEDIDO_ENCERRADO` | Pedido decidido |
| 422 | `RESPONSAVEL_INVALIDO` | `responsavel_id` inexistente, inativo ou sem `adoptions:update` |
| 409 | `HORARIO_INDISPONIVEL` | O responsável já tem compromisso ativo que se sobrepõe (mensagem cita tipo, adotante, data e hora) |

**Regras:** responsável = o informado; senão o responsável do pedido; senão quem está agendando. A verificação de
conflito roda sob uma trava de agenda (`pg_advisory_xact_lock`) e compara intervalos `[início, início + duração)` só
de compromissos `agendado` do mesmo responsável (horários encostados não conflitam). **Visita** move o pedido para
`visita_agendada` (e o adotante também, se ainda não for `adotante`); **entrevista** só tira o pedido de `novo`
(vira `em_analise`). Histórico e auditoria `agendar`. E-mail depois de gravar, se pedido.

---

## `PATCH /api/v1/adoption-requests/:id/appointments/:appointmentId` — Remarcar

| | |
| --- | --- |
| Permissão | `adoptions:update` |
| Validador | `validateAppointmentParams` + `validateReschedule` |
| Controller / Service | `reschedule` → `adoption-triage-service.reschedule` |

**Body:** `data_hora` (obrigatório, futuro), `duracao_minutos` (15–480), `local` (até 300), `mensagem` (até 1000),
`enviar_email` (booleano). Campos omitidos mantêm o valor anterior; texto vazio limpa.

**Resposta 200:** `{ pedido, agendamento, email }`.

**Erros específicos:** 422 `DATA_NO_PASSADO`; 404 `PEDIDO_NAO_ENCONTRADO`; 409 `PEDIDO_ENCERRADO`;
404 `AGENDAMENTO_NAO_ENCONTRADO` (inexistente ou de outro pedido); 409 `AGENDAMENTO_ENCERRADO` (já realizado/cancelado);
409 `HORARIO_INDISPONIVEL`.

**Regras:** mantém o responsável do agendamento; o conflito ignora o próprio compromisso. Histórico ("remarcada de … para …"),
auditoria `remarcar_agendamento` e e-mail opcional.

---

## `POST /api/v1/adoption-requests/:id/appointments/:appointmentId/cancel` — Cancelar agendamento

| | |
| --- | --- |
| Permissão | `adoptions:update` |
| Validador | `validateAppointmentParams` + `validateCancelAppointment` |
| Controller / Service | `cancelAppointment` → `adoption-triage-service.cancelAppointment` |

**Body:** `motivo` (até 500, opcional; vai ao adotante), `enviar_email` (booleano).

**Resposta 200:** `{ pedido, agendamento, email }`.

**Erros específicos:** 404 `PEDIDO_NAO_ENCONTRADO`; 404 `AGENDAMENTO_NAO_ENCONTRADO`; 409 `AGENDAMENTO_ENCERRADO`.
Diferente de agendar/remarcar, funciona também em pedido já decidido.

**Regras:** o agendamento vira `cancelado`. Se era **visita**, o pedido estava `visita_agendada` e não sobrou outra
visita ativa, o pedido volta para `em_analise` (e o adotante também, se estava `visita_agendada`). Histórico,
auditoria `cancelar_agendamento` e e-mail opcional.

---

## `POST /api/v1/adoption-requests/:id/appointments/:appointmentId/complete` — Marcar como realizado

| | |
| --- | --- |
| Permissão | `adoptions:update` |
| Validador | `validateAppointmentParams` |
| Controller / Service | `completeAppointment` → `adoption-triage-service.completeAppointment` |

**Body:** nenhum. **Resposta 200:** `{ "pedido": { …detalhe } }` (sem `agendamento` nem `email`).

**Erros específicos:** 404 `PEDIDO_NAO_ENCONTRADO`; 404 `AGENDAMENTO_NAO_ENCONTRADO`; 409 `AGENDAMENTO_ENCERRADO`.

**Regras:** o agendamento vira `realizado`; o status do pedido não muda. Histórico e auditoria `concluir_agendamento`.

---

## `POST /api/v1/adoption-requests/:id/term-signed` — Marcar Termo de Adoção como assinado

| | |
| --- | --- |
| Permissão | `adoptions:update` |
| Controller / Service | `markTermSigned` → `adoption-triage-service.markTermSigned` |

**Body:** nenhum. **Resposta 200:** detalhe do pedido.

**Erros específicos:** 404 `PEDIDO_NAO_ENCONTRADO`; 409 `PEDIDO_NAO_APROVADO`; 409 `TERMO_JA_ASSINADO`.

**Regras:** grava `termo_assinado = true` e `termo_assinado_em` = agora. Auditoria `marcar_termo_assinado`. O termo
em si (arquivo/assinatura) não é armazenado pela API.
