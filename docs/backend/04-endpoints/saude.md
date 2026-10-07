# Saúde e arquivos estáticos

Rotas fora de `/api/v1`: não passam pelo limite global da API nem respondem com `Cache-Control: no-store`
(os cabeçalhos de segurança e o `X-Request-Id` valem para todas). Arquivo: `src/modules/health/health-routes.js`.

---

## `GET /` — Identificação da API

| | |
| --- | --- |
| Autenticação | Nenhuma |
| Controller | `health-controller.getApiInfo` (sem service) |

**Resposta 200** (sem o envelope `data`):

```json
{ "ok": true, "name": "Patas em Casa API", "version": "1.0.0", "mode": "production" }
```

`mode` é `process.env.NODE_ENV` (padrão `development`). Não há respostas de erro específicas.

---

## `GET /health` — Processo vivo (liveness)

| | |
| --- | --- |
| Autenticação | Nenhuma |
| Controller | `health-controller.checkHealth` |

**Resposta 200:**

```json
{ "ok": true, "status": "ok", "timestamp": "2026-10-07T12:00:00.000Z" }
```

Não consulta o banco. Usado pelo `HEALTHCHECK` do Dockerfile.

---

## `GET /ready` — Pronto para atender (readiness)

| | |
| --- | --- |
| Autenticação | Nenhuma |
| Controller / função | `health-controller.checkReadiness` → `db/connection-check.testConnection` |

Executa `SELECT 1` com até 3 tentativas (espera 400 ms, 800 ms) e timeout de 10 s por consulta — tolera o banco
Neon "acordando".

**Respostas:**

| Status | Corpo | Quando |
| --- | --- | --- |
| 200 | `{ "ok": true, "status": "ready", "database": "database", "timestamp": "…" }` | Banco respondeu |
| 503 | `{ "ok": false, "status": "not-ready", "database": "mock", "timestamp": "…" }` | `DATABASE_URL` vazia |
| 503 | `{ "ok": false, "status": "not-ready", "database": "unavailable", "timestamp": "…" }` | As 3 tentativas falharam |

⚠️ A confirmar: `connection-check.js` decide o modo "mock" olhando só `DATABASE_URL`, enquanto o pool usa
`DATABASE_URL_DIRECT` com prioridade; com apenas `DATABASE_URL_DIRECT` definida, `/ready` responde 503 "mock"
mesmo com o banco acessível.

---

## `GET /uploads/*` — Fotos enviadas pelo painel

| | |
| --- | --- |
| Autenticação | Nenhuma |
| Implementação | `express.static(path.resolve(UPLOAD_DIR))` em `src/app.js` |

- Serve `UPLOAD_DIR` (padrão `uploads/`); as fotos dos animais ficam em `uploads/animais/<uuid>.<jpg|png|webp>` e a URL
  pública é `<API_PUBLIC_URL>/uploads/animais/<arquivo>`.
- Sem listagem de diretório (`index: false`); arquivos iniciados por ponto são negados (`dotfiles: 'deny'`).
- Cache de 365 dias, `immutable` (o nome do arquivo é um UUID e o conteúdo nunca muda).
- `Cross-Origin-Resource-Policy: cross-origin` só aqui, para o site em outra origem exibir as imagens.
- Arquivo inexistente segue para o 404 padrão da API (`ROTA_NAO_ENCONTRADA`).
