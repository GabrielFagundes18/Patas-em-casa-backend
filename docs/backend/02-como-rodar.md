# 2. Como rodar

## Pré-requisitos

| Item | Versão | Fonte |
| --- | --- | --- |
| Node.js | 20 ou superior (`engines.node >= 20`); a imagem Docker e o CI usam **24** | `package.json`, `Dockerfile`, `.github/workflows/backend-ci.yml` |
| npm | o que vem com o Node (o projeto usa `package-lock.json` e `npm ci`) | `package-lock.json` |
| PostgreSQL | ⚠️ A confirmar: o README pede "14+"; o CI usa `postgres:16`; produção é Neon | `README.md`, CI |
| Extensão `pgcrypto` | criada pela migration 000 (`gen_random_uuid()`) | `migrations/000-patas-em-casa-schema.sql` |
| SMTP | opcional (e-mails) | `src/config/env.js` |
| Conta Mercado Pago | opcional (doação online) | `src/config/env.js` |

## Instalação

```bash
npm ci
cp .env.example .env   # preencha conforme a tabela de variáveis abaixo
```

## Banco de dados e migrations

O banco é criado e atualizado por `scripts/migrar.js` (`npm run db:migrate`), que aplica, em ordem, os arquivos
listados em `migrations/ordem.json` — hoje `000`, `009`, `010`, `011`, `012` e `013` — cada um numa transação, e
registra nome e checksum SHA-256 em `schema_migrations`. Um arquivo já aplicado não pode mudar (o script recusa).

| Comando | O que faz |
| --- | --- |
| `npm run db:migrate` | Aplica as migrations pendentes |
| `npm run db:migrate -- --status` | Lista aplicadas e pendentes, sem alterar nada |
| `npm run db:migrate -- --baseline <arquivo>` | Marca um arquivo como aplicado sem executar (ex.: a `000` num banco que já tem o schema) |

- Conexão usada: `DATABASE_URL_DIRECT` ou, na falta dela, `DATABASE_URL`.
- **Banco novo:** `npm run db:migrate` cria tudo (000 + 009–013).
- **Banco existente com o schema 000 (Neon):** rode uma vez `--baseline 000-patas-em-casa-schema.sql` e depois `npm run db:migrate`.
- As migrations `001`–`008` são **propostas** e não estão em `ordem.json` (veja [5. Banco de dados](05-banco-de-dados.md#migrations)).
- Reversões: `migrations/rollback/<arquivo>.sql`, aplicadas manualmente (não há comando npm para isso).

### Seeds

Não há seeds no repositório. Os dados de teste dos testes de integração são criados dentro de uma transação desfeita
no final (`tests/helpers/db-transaction.js`). As etapas do processo de adoção (`adoption_steps`) não têm endpoint de
cadastro: ⚠️ A confirmar como são inseridas (só pelo banco).

### Primeiro usuário do painel

Não há endpoint público de cadastro. Crie o usuário no banco e defina a senha com o script interativo:

```bash
npm run definir-senha -- email@patasemcasa.org
```

O script (`scripts/definir-senha.js`) pede a senha duas vezes (mostrada como `*`), aplica a mesma política de senha
da API e grava o hash bcrypt (12 rodadas). Também aceita a senha por entrada redirecionada (uma por linha). Exige
`DATABASE_URL`. Depois do primeiro administrador, os demais membros são criados pelo painel (`POST /api/v1/users`).

## Rodar

| Comando | O que faz |
| --- | --- |
| `npm run dev` | `node --watch server.js` (reinicia ao salvar) |
| `npm start` | `node server.js` |
| `npm run build` | Só imprime "Backend Node.js não exige build." |

A API sobe em `PORT` (padrão 4000). `GET /health` responde se o processo está vivo; `GET /ready`, se o banco responde.

## Testes

| Comando | O que roda | Banco |
| --- | --- | --- |
| `npm test` | `node --test tests/unit/*.test.js` (109 testes unitários e HTTP) | Não precisa |
| `npm run test:integration` | `node --test --test-concurrency=1 tests/integration/*.test.js` (1 teste com 14 fluxos) | Precisa de `DATABASE_URL` com as migrations aplicadas; sem ela o teste é pulado. Tudo roda numa transação desfeita no fim |

Detalhes em [14. Testes](14-testes.md).

## Lint e formatação

Não há linter nem formatador configurados no back-end. O CI faz apenas verificação de sintaxe
(`find src scripts server.js -name '*.js' -exec node --check {} +`).

## Docker

Há um `Dockerfile` (não há `docker-compose`):

- duas etapas: `npm ci --omit=dev` e imagem final `node:24-alpine` com `NODE_ENV=production`;
- copia `package.json`, `server.js`, `src/` e `scripts/` (o `.dockerignore` exclui `.env*`, testes, docs e migrations);
- cria `/app/uploads` (volume) para as fotos; roda como usuário `node`; expõe a porta 4000;
- `HEALTHCHECK` chama `GET /health` a cada 30 s; `CMD ["node", "server.js"]` (sem npm, para o SIGTERM chegar ao processo).

```bash
docker build -t patas-em-casa-api .
docker run --env-file .env -p 4000:4000 -v patas_uploads:/app/uploads patas-em-casa-api
```

## Variáveis de ambiente

Todas lidas por `src/config/env.js`, exceto onde indicado. Exemplos sem valores reais.

| Variável | Obrigatória | Padrão | Descrição | Exemplo |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | não | `development` | `development`, `test` ou `production` (outro valor impede o início) | `production` |
| `PORT` | não | `4000` | Porta HTTP (0–65535) | `4000` |
| `REQUEST_TIMEOUT_MS` | não | `30000` | Tempo máximo de uma requisição (mín. 1000); `headersTimeout` = este + 5000 | `30000` |
| `CORS_ORIGIN` | **em produção** | dev: `http://localhost:3000,http://127.0.0.1:3000` | Origens do site, separadas por vírgula, com protocolo e porta | `https://patasemcasa.org` |
| `TRUST_PROXY` | atrás de proxy | — | Formato do Express: nº de proxies, `true`/`false` ou redes. Necessário para o limite de taxa ver o IP real | `1` |
| `DATABASE_URL` | **em produção** | — | Conexão do PostgreSQL. Lida também por `src/db/connection-check.js` (rota `/ready`) e `scripts/definir-senha.js` | `postgresql://USUARIO:SENHA@HOST-pooler.REGIAO.aws.neon.tech/BANCO?sslmode=verify-full` |
| `DATABASE_URL_DIRECT` | não | — | Conexão direta do Neon. **Tem prioridade sobre `DATABASE_URL` no pool da API** (`src/db/pool.js`) e nas migrations | `postgresql://USUARIO:SENHA@HOST.REGIAO.aws.neon.tech/BANCO?sslmode=verify-full` |
| `JWT_SECRET` | **em produção** (mín. 32) | dev/test: aleatório por processo | Assina o token de acesso | (gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `REFRESH_TOKEN_SECRET` | **em produção** (mín. 32, diferente do `JWT_SECRET`) | dev/test: aleatório | Assina o cookie de renovação | (idem) |
| `JWT_EXPIRES_IN` | não | `15m` | Validade do token de acesso (formato do `jsonwebtoken`). Lida direto em `src/middleware/auth.js`, sem validação | `15m` |
| `SESSION_IDLE_MINUTES` | não | `30` | Expiração por inatividade da sessão (5–1440) | `30` |
| `SESSION_MAX_HOURS` | não | `12` | Duração máxima da sessão desde o login (1–168) | `12` |
| `SMTP_HOST` | para e-mails | — | Servidor SMTP. Sem ele, nenhum e-mail é enviado e as ações informam o motivo | `smtp.exemplo.com` |
| `SMTP_PORT` | não | `587` | Porta SMTP (1–65535) | `587` |
| `SMTP_SECURE` | não | deduzido (`true` se porta 465) | `true` ou `false` | `false` |
| `SMTP_USER` / `SMTP_PASS` | se o servidor exigir | — | Credenciais SMTP | — |
| `EMAIL_FROM` | se houver `SMTP_HOST` e não houver `SMTP_USER` | `SMTP_USER` | Remetente | `Patas em Casa <contato@exemplo.org>` |
| `EMAIL_REPLY_TO` | não | — | Endereço de resposta | `contato@exemplo.org` |
| `FRONTEND_URL` | não | primeira origem de `CORS_ORIGIN` (ou `http://localhost:3000`) | Endereço do site nos links dos e-mails e nos retornos do Mercado Pago | `https://patasemcasa.org` |
| `API_PUBLIC_URL` | **em produção** | `http://localhost:<PORT>` | Endereço público da API: URLs das fotos e `notification_url` do Mercado Pago | `https://api.patasemcasa.org` |
| `UPLOAD_DIR` | não | `uploads` | Pasta das fotos enviadas (subpasta `animais/`) | `/app/uploads` |
| `MERCADOPAGO_ACCESS_TOKEN` | para doação online | — | Token da aplicação no Mercado Pago. Sem ele, as rotas de doação online respondem 503. Começando com `TEST-`, usa o checkout de teste | `TEST-...` |
| `MERCADOPAGO_WEBHOOK_SECRET` | **se houver `MERCADOPAGO_ACCESS_TOKEN`** | — | "Assinatura secreta" dos webhooks do Mercado Pago | — |
| `ENCRYPTION_KEY` | não | — | Está no `.env.example` ("reservada para cifrar CPF e segredos — migrações 003 e 007"), mas **nenhum código a lê** | — |

Regras de validação na inicialização (a API não sobe se falharem): `NODE_ENV` inválido; `PORT`, `REQUEST_TIMEOUT_MS`,
`SESSION_*` ou `SMTP_PORT` fora da faixa; origem de `CORS_ORIGIN` que não seja `http(s)://host[:porta]`;
`FRONTEND_URL`/`API_PUBLIC_URL` que não sejam URLs http(s); `SMTP_SECURE` diferente de `true`/`false`; `SMTP_HOST`
sem remetente; `MERCADOPAGO_ACCESS_TOKEN` sem `MERCADOPAGO_WEBHOOK_SECRET`; e, em produção, ausência de
`DATABASE_URL`, `CORS_ORIGIN`, `API_PUBLIC_URL` ou segredos JWT fortes e distintos.
