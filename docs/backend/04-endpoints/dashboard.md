# Visão geral do painel (`/api/v1/dashboard`)

Rotas: `src/modules/dashboard/dashboard-routes.js`.

## `GET /api/v1/dashboard/summary` — Indicadores do painel

| | |
| --- | --- |
| Autenticação | Bearer; `dashboard:read` (todos os cargos) |
| Validador | nenhum |
| Controller / Service | `dashboard-controller.summary` → `dashboard-service.summary` → `dashboard-repository` (11 consultas em paralelo) |

**Query:** `atualizar=true` ignora o cache.

**Resposta 200** (resumida):

```json
{
  "data": {
    "atualizado_em": "2026-10-07T12:00:00.000Z",
    "indicadores": { "total_animais": 11, "animais_sob_cuidado": 7, "adocoes_mes": 1, "adocoes_ano": 4,
      "total_adocoes": 4, "arrecadado_mes": 350.5, "pedidos_pendentes": 3 },
    "animais": {
      "por_status": [ { "status": "disponivel", "total": 5 } ],
      "saude": { "total": 11, "vacinados": 9, "castrados": 8, "adotados": 4,
        "percentual_vacinados": 81.8, "percentual_castrados": 72.7, "percentual_adotados": 36.4 },
      "urgentes": [ { "id": "…", "nome": "Nino", "especie": "cachorro", "foto_url": null, "data_entrada": "2026-08-02" } ]
    },
    "pedidos": {
      "por_status": [ { "status": "novo", "total": 2 } ],
      "recentes": [ { "id": "…", "status": "novo", "prioridade": "medio", "data_pedido": "…",
        "animal": { "id": "…", "nome": "Mel" }, "adotante_nome": "Ana Souza" } ]
    },
    "doacoes": { "por_metodo": [ { "metodo": "pix", "quantidade": 3, "total": 150 } ] },
    "series_mensais": [ { "mes": "2026-10", "adocoes": 1, "doacoes_total": 350.5, "doacoes_quantidade": 4 } ],
    "agenda": [ { "id": "…", "tipo": "visita", "pedido_id": "…", "referencia_em": "…",
      "animal_nome": "Mel", "adotante_nome": "Ana Souza", "responsavel_nome": "Carla Admin" } ]
  },
  "meta": {}
}
```

**Regras e origem de cada número:**

| Campo | Origem |
| --- | --- |
| `total_animais`, `total_adocoes`, `pedidos_pendentes`, `arrecadado_mes` | View `vw_kpis_gerais` (`total_adocoes` = animais `adotado`; `pedidos_pendentes` = pedidos fora de `aprovado`/`reprovado`; `arrecadado_mes` = doações `confirmada` do mês corrente) |
| `animais_sob_cuidado` | Soma dos animais `disponivel`, `em_processo` e `urgente` |
| `adocoes_mes`, `adocoes_ano`, `series_mensais[].adocoes` | Pedidos `aprovado` contados pelo **mês de `atualizado_em`** — aproximação, porque o schema não guarda a data da decisão (⚠️ qualquer alteração posterior no pedido, como marcar o termo, muda o mês) |
| `saude` | Contagens sobre todos os animais; percentuais com 1 casa decimal |
| `urgentes` | Até 5 animais `urgente`, os que entraram há mais tempo primeiro |
| `pedidos.recentes` | Até 5 pedidos `novo`, mais recentes primeiro |
| `doacoes.por_metodo` | Doações `confirmada` dos últimos 12 meses (`nao_informado` quando sem método) |
| `series_mensais` | Últimos 12 meses, incluindo o atual, sem buracos (meses sem dados = 0); doações pela view `vw_doacoes_por_mes` |
| `agenda` | Até 10 itens: visitas/entrevistas `agendado` a partir de ontem, e pedidos `aprovado` com termo não assinado (`tipo: "termo_pendente"`, data = `atualizado_em`), em ordem de data |

**Cache:** o resultado fica em memória por 15 s (por instância da API); `atualizar=true` força nova leitura.
Sem erros específicos além dos comuns.
