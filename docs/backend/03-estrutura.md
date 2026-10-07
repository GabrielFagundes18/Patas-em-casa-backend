# 3. Estrutura de pastas

Organização em **módulos por domínio** (`src/modules/<domínio>/`) com camadas fixas dentro de cada módulo, mais pastas
transversais (configuração, banco, middlewares, integrações e utilitários). Padrão de nome dos arquivos de módulo:
`<entidade>-<camada>.js`.

```text
Patas-em-Casa-BackEnd/
├── server.js                         # Inicia o HTTP (app.listen), timeouts e encerramento ordenado (SIGTERM/SIGINT)
├── package.json / package-lock.json  # Dependências e scripts npm
├── Dockerfile / .dockerignore        # Imagem de produção (node:24-alpine, usuário node, volume /app/uploads)
├── .env.example                      # Modelo das variáveis de ambiente (sem valores reais)
├── .gitignore                        # node_modules, .env*, uploads/, logs, arquivos de sistema/IDE
├── .github/workflows/backend-ci.yml  # CI: auditoria, sintaxe, testes, migrations, integração e build Docker
├── README.md                         # Visão rápida, instalação e operação
├── docs/
│   ├── backend/                      # Esta documentação
│   ├── openapi.yaml                  # Contrato OpenAPI 3.0.3 de todas as rotas (conferido por teste)
│   ├── permissoes.md                 # Matriz de permissões (gerada por npm run docs:permissoes)
│   └── migrations-plan.md            # Estado das migrations e propostas 001–008
├── migrations/
│   ├── 000-…sql a 013-…sql           # SQL versionado (000 e 009–013 aplicadas; 001–008 propostas)
│   ├── rollback/                     # Reversão de cada migration
│   └── ordem.json                    # Lista do que scripts/migrar.js aplica, em ordem
├── scripts/
│   ├── migrar.js                     # npm run db:migrate (aplica, --status, --baseline)
│   ├── definir-senha.js              # npm run definir-senha -- <email> (senha de um usuário do painel)
│   └── gerar-doc-permissoes.js       # npm run docs:permissoes (gera docs/permissoes.md)
├── src/
│   ├── app.js                        # Monta o Express: middlewares globais, /uploads, routers, 404 e tratador de erros
│   ├── config/
│   │   ├── env.js                    # Lê e valida as variáveis de ambiente (readConfig)
│   │   ├── permissions.js            # Matriz única de permissões (cargo × módulo × ação) e rótulos dos cargos
│   │   └── domain-values.js          # Valores aceitos (espelho das restrições CHECK do banco)
│   ├── db/
│   │   ├── pool.js                   # Pool do pg (10 conexões, SSL, DATE como texto)
│   │   ├── connection-check.js       # testConnection() com 3 tentativas (usado por /ready) e reexporta o pool
│   │   ├── sql.js                    # Montagem segura de WHERE e UPDATE parcial com parâmetros $n
│   │   └── transaction.js            # withTransaction(work): BEGIN/COMMIT/ROLLBACK
│   ├── middleware/
│   │   ├── security-headers.js       # Cabeçalhos de segurança e Cache-Control: no-store na API
│   │   ├── request-context.js        # requestId (X-Request-Id) e log de cada requisição
│   │   ├── rate-limit.js             # Limite de requisições por IP, em memória (fábrica)
│   │   ├── auth.js                   # signToken, requireAuth (JWT + usuário + sessão no banco), requirePermission
│   │   ├── csrf.js                   # Exige X-Requested-With: XMLHttpRequest (rotas do cookie)
│   │   ├── validate-request.js       # Executa um validador e responde 422 com detalhes por campo
│   │   ├── upload.js                 # Recebe as fotos (multer em memória, 10 × 5 MB)
│   │   ├── async-handler.js          # Encaminha erros de handlers async para o tratador
│   │   └── error-handler.js          # Converte qualquer erro no formato padrão { error: { code, message, details } }
│   ├── integrations/                 # Serviços externos
│   │   ├── email/                    # mailer.js (SMTP), layout.js (HTML+texto) e modelos: account-, adoption-, donation-emails.js
│   │   ├── payments/                 # mercado-pago-client.js (REST + verificação da assinatura do webhook)
│   │   └── storage/                  # photo-storage.js (fotos no disco, tipo pelo conteúdo)
│   ├── modules/                      # Um domínio por pasta
│   │   ├── adopters/                 # Adotantes e LGPD (controller, routes, service, repository, validators)
│   │   ├── adoptions/                # Pedido público (adoption-request-*) e triagem/agenda (adoption-triage-*, appointment-repository)
│   │   ├── animals/                  # Animais, fotos (animal-media-repository) e máquina de estados (animal-status-rules)
│   │   ├── audit/                    # audit-service (registro de eventos sensíveis) e audit-repository
│   │   ├── auth/                     # Login, sessões, links de acesso, bloqueio por falhas e validadores
│   │   ├── content/                  # Etapas do processo de adoção (adoption_steps)
│   │   ├── dashboard/                # Indicadores do painel e números públicos
│   │   ├── donations/                # Doações manuais, doações online/assinaturas (online-donation-*) e webhook-routes
│   │   ├── health/                   # /, /health e /ready
│   │   ├── permissions/              # GET /api/v1/permissions (matriz)
│   │   ├── public/                   # Rotas sem login (agrega serviços de outros módulos)
│   │   ├── stories/                  # Histórias de adoção
│   │   ├── users/                    # Equipe e acessos (usuários do painel)
│   │   └── volunteers/               # Voluntários e áreas
│   └── utils/
│       ├── app-error.js              # Classe AppError(status, code, message, details)
│       ├── http-response.js          # Envelopes successResponse, listResponse, errorResponse
│       ├── pagination.js             # parsePagination (padrão 20, máx. 100)
│       ├── validators.js             # Padrões (UUID, e-mail, telefone, data) e helpers de validação
│       ├── password-policy.js        # Política de senha
│       ├── masking.js                # Mascaramento de e-mail, telefone e contatos em texto
│       ├── csv.js                    # CSV com ; e BOM, neutralização de fórmulas, limite de 10.000 linhas
│       ├── cookies.js                # Parse e serialização de cookies
│       ├── brasilia-time.js          # Datas "AAAA-MM-DDTHH:mm" no horário de Brasília (UTC-3)
│       └── logger.js                 # Log JSON por linha com lista fechada de campos (sem dados pessoais)
└── tests/
    ├── unit/                         # 20 arquivos, 109 testes (serviços com repositórios falsos; testes HTTP sobem o app em porta efêmera e usam fetch)
    ├── integration/api-flows.test.js # 14 fluxos no banco real, dentro de transação desfeita
    └── helpers/                      # db-transaction (rollback), fake-sessions, fake-users
```

## Camadas e responsabilidades

| Camada | Arquivo | Responsabilidade | Não faz |
| --- | --- | --- | --- |
| Rota | `*-routes.js` | Liga método+caminho à cadeia: autenticação → permissão → validação → controller | Regras de negócio |
| Validador | `*-validators.js` / `*-validator.js` | Confere formato dos dados de entrada e devolve detalhes por campo | Acesso ao banco |
| Controller | `*-controller.js` | Traduz HTTP ↔ serviço: lê `req`, chama o serviço, monta a resposta (status, envelope, CSV) | SQL |
| Service | `*-service.js` | Regras de negócio, transações, auditoria, e-mails, integração com o gateway | HTTP |
| Repository | `*-repository.js` | Todo o SQL, sempre parametrizado | Regras de negócio |
| Integração | `src/integrations/*` | Conversa com SMTP, Mercado Pago e disco | Regras de negócio |

Os serviços são criados por fábricas (`createXService({ repository, audit, ... })`) com dependências injetáveis; o
módulo exporta a instância padrão e a fábrica (usada nos testes).

## Arquivos por módulo

Gerado a partir de `src/modules/` (69 arquivos). "Regras" = funções puras de regra de negócio.

| Módulo | Rotas | Controller | Validadores | Services | Regras | Repositories | Arquivos |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| `adopters` | `adopter-routes.js` | `adopter-controller.js` | `adopter-validators.js` | `adopter-service.js` | — | `adopter-repository.js` | 5 |
| `adoptions` | `adoption-request-routes.js` | `adoption-request-controller.js` | `adoption-request-validator.js`, `adoption-triage-validators.js` | `adoption-request-service.js`, `adoption-triage-service.js` | — | `adoption-request-repository.js`, `adoption-triage-repository.js`, `appointment-repository.js` | 9 |
| `animals` | `animal-routes.js` | `animal-controller.js` | `animal-validators.js` | `animal-service.js` | `animal-status-rules.js` | `animal-media-repository.js`, `animal-repository.js` | 7 |
| `audit` | — | — | — | `audit-service.js` | — | `audit-repository.js` | 2 |
| `auth` | `auth-routes.js` | `auth-controller.js` | `change-password-validator.js`, `login-validator.js`, `password-reset-validators.js` | `access-link-service.js`, `auth-service.js`, `login-throttle.js` | — | `access-link-repository.js`, `session-repository.js` | 10 |
| `content` | — | — | — | `adoption-step-service.js` | — | `adoption-step-repository.js` | 2 |
| `dashboard` | `dashboard-routes.js` | `dashboard-controller.js` | — | `dashboard-service.js` | — | `dashboard-repository.js` | 4 |
| `donations` | `donation-routes.js`, `webhook-routes.js` | `donation-controller.js`, `online-donation-controller.js` | `donation-validators.js`, `online-donation-validators.js` | `donation-service.js`, `online-donation-service.js` | — | `donation-repository.js`, `online-donation-repository.js` | 10 |
| `health` | `health-routes.js` | `health-controller.js` | — | — | — | — | 2 |
| `permissions` | `permission-routes.js` | — | — | — | — | — | 1 |
| `public` | `public-routes.js` | `public-controller.js` | — | — | — | — | 2 |
| `stories` | `story-routes.js` | `story-controller.js` | `story-validators.js` | `story-service.js` | — | `story-repository.js` | 5 |
| `users` | `user-routes.js` | `user-controller.js` | `user-validators.js` | `user-service.js` | — | `user-repository.js` | 5 |
| `volunteers` | `volunteer-routes.js` | `volunteer-controller.js` | `volunteer-validators.js` | `volunteer-service.js` | — | `volunteer-repository.js` | 5 |
