# Patas em Casa — API

API do site público e do painel administrativo da ONG Patas em Casa (Node.js + Express + PostgreSQL/Neon).

- Contrato completo dos endpoints: [`docs/openapi.yaml`](docs/openapi.yaml)
- Matriz de permissões por cargo: [`docs/permissoes.md`](docs/permissoes.md)
- Schema atual do banco: [`migrations/000-patas-em-casa-schema.sql`](migrations/000-patas-em-casa-schema.sql)
- Plano de migrações propostas: [`docs/migrations-plan.md`](docs/migrations-plan.md)

## Requisitos

- Node.js 20 ou superior (testado com 24)
- Banco PostgreSQL 14+ (Neon) com o schema de `migrations/000-patas-em-casa-schema.sql`

## Instalação e configuração

```bash
npm ci
cp .env.example .env
```

Preencha o `.env` (todas as variáveis estão comentadas no `.env.example`):

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `DATABASE_URL` | sim | Conexão da API (host `-pooler` do Neon, `sslmode=verify-full`) |
| `DATABASE_URL_DIRECT` | para migrações | Conexão direta do Neon |
| `JWT_SECRET` | em produção | Assina o token de acesso (mín. 32 caracteres) |
| `REFRESH_TOKEN_SECRET` | em produção | Assina o cookie de renovação (diferente do `JWT_SECRET`) |
| `CORS_ORIGIN` | em produção | Origens do frontend, separadas por vírgula |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | não | Expiração por inatividade (30) e limite absoluto (12) |
| `TRUST_PROXY` | atrás de proxy | Nº de proxies confiáveis, para o limite de taxa usar o IP real |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | para e-mails | Servidor que envia o aviso de visita/entrevista ao adotante. Sem `SMTP_HOST`, o agendamento funciona e o painel avisa que o e-mail não saiu |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | não | Remetente exibido (padrão: `SMTP_USER`) e endereço para as respostas |
| `FRONTEND_URL` | não | Endereço do site nos links dos e-mails (padrão: primeira origem de `CORS_ORIGIN`) |
| `API_PUBLIC_URL` | em produção | Endereço público da API, usado nas URLs das fotos enviadas |
| `UPLOAD_DIR` | não | Pasta das fotos enviadas (padrão `uploads`; no Docker, volume em `/app/uploads`) |
| `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_WEBHOOK_SECRET` | para doação online | Credencial da aplicação e assinatura secreta dos webhooks (`<API_PUBLIC_URL>/api/v1/webhooks/mercadopago`) |

Em desenvolvimento, segredos ausentes viram valores aleatórios a cada início (as sessões caem quando o servidor
reinicia); defina-os no `.env` para evitar isso. A aplicação valida as variáveis ao iniciar e falha com mensagem clara.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe a API com recarga automática (porta 4000) |
| `npm start` | Sobe a API em modo produção |
| `npm test` | Testes unitários e HTTP (sem banco) |
| `npm run db:migrate` | Aplica as migrations de `migrations/ordem.json` (`--status`, `--baseline <arquivo>`) |
| `npm run test:integration` | Fluxos completos no banco do `.env`, dentro de uma transação desfeita ao final |
| `INTEGRACAO_BANCO_VAZIO=1 npm run test:integration` | Os mesmos fluxos num schema vazio criado pelo `000` (como no CI) |
| `npm run definir-senha -- email@ong.org` | Define a senha de um usuário do painel (digitação mascarada) |
| `npm run docs:permissoes` | Regenera `docs/permissoes.md` a partir da matriz de permissões |

Primeiro acesso ao painel: crie o usuário no banco (ou peça a um administrador) e rode `npm run definir-senha`.
A senha precisa ter 10+ caracteres, com letras e números.

## Estrutura

```text
server.js                  # inicia o HTTP e faz o encerramento ordenado (SIGTERM/SIGINT)
src/
  app.js                   # middlewares globais e montagem das rotas /api/v1
  config/                  # env (validação), permissions (matriz única), domain-values (valores do banco)
  db/                      # pool do PostgreSQL e helper de transação
  middleware/              # auth, csrf, rate-limit, validate-request, security-headers, error-handler...
  router/                  # router-<modulo>.js: rota → permissão → validador → controller
  controller/              # controller-<modulo>.js: HTTP (req/res), sem SQL
  services/<modulo>/       # regras de negócio, transações e auditoria, sem HTTP
  repositories/<modulo>/   # todo o SQL, sempre parametrizado
  validators/<modulo>/     # validação de entrada (devolve detalhes por campo)
  utils/                   # respostas, erros, paginação, CSV, mascaramento, cookies, política de senha, logger
migrations/                # 000 = schema atual; 001–008 = propostas (ainda não aplicadas) e rollbacks
scripts/                   # definir-senha, gerar-doc-permissoes
tests/                     # unitários/HTTP; tests/integration = banco real com ROLLBACK
docs/                      # OpenAPI, permissões, plano de migrações
```

### Fluxo de uma requisição

`router` → `requireAuth` (lê usuário, cargo e situação **no banco**) → `requirePermission('modulo:acao')` →
`validateRequest(validador)` → `controller` → `service` (regras, transação, auditoria) → `repository` (SQL) → banco.
Erros viram `AppError` e o `error-handler` responde no formato padrão, sem detalhes internos.

### Criar um módulo novo

1. Copie o módulo de **histórias** como modelo: `repositories/stories`, `services/stories`, `validators/stories`,
   `controller/controller-stories.js` e `router/router-stories.js`.
2. Acrescente o módulo e as ações em `src/config/permissions.js` e rode `npm run docs:permissoes`.
3. Monte a rota em `src/app.js` e documente cada operação em `docs/openapi.yaml`
   (o teste `openapi-coverage` falha se uma rota ficar sem documentação).
4. Escreva testes unitários (serviço com repositório falso) e um fluxo em `tests/integration`.

## Segurança e LGPD

- Senhas com bcrypt (12 rodadas); bloqueio de login após 5 falhas por e-mail, com tempo crescente; resposta igual
  para e-mail inexistente e senha errada.
- Token de acesso de 15 min; renovação por cookie `httpOnly`, `SameSite=Strict`, `Secure` em produção, com rotação
  a cada uso, expiração por inatividade e limite absoluto. `refresh` e `logout` exigem `X-Requested-With`.
- Autorização por matriz única; cargo e desativação valem na hora (consultados a cada requisição).
- Limites de taxa: API (1000/5 min por IP), login (20/15 min) e formulários públicos (10/h), com campo-isca anti-robô.
- Dados pessoais de adotantes mascarados por padrão (inclusive dentro de observações); revelar exige `adopters:reveal`
  e gera auditoria. Exportação do titular, anonimização e exclusão (LGPD) exigem confirmação digitada.
- CSV com neutralização de fórmulas; `Cache-Control: no-store` nas respostas da API; logs sem dados pessoais.
- Auditoria: grava em `auditoria_eventos` quando a migração 001 estiver aplicada; até lá, registra o evento no log
  estruturado (somente identificadores).

## Operação

- `GET /health` (processo vivo) e `GET /ready` (banco acessível, com nova tentativa para o Neon que hiberna).
- Encerramento ordenado: para de aceitar conexões, aguarda até 5 s as requisições em andamento e fecha o pool;
  se o banco não responder, sai após 8 s para não travar reinícios e deploys.
- Logs em JSON por linha, com `requestId` (também no cabeçalho `X-Request-Id`).

## Limitações conhecidas (dependem de aprovação)

As funcionalidades abaixo dependem das migrações 001–008 (propostas em `migrations/`, não aplicadas) ou de
bibliotecas/provedores ainda não aprovados: 2FA, sessões persistidas e logout remoto, consulta de auditoria,
mídias e prontuário veterinário, CPF cifrado e solicitações LGPD registradas, agenda de visitas e documentos do termo,
lares temporários, apadrinhamento, prestação de contas, webhooks do gateway, eventos, configurações da ONG,
páginas institucionais, modo de manutenção, jobs agendados, PDF e upload de arquivos.
