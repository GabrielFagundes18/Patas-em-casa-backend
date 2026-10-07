# 14. Testes

## Ferramentas

- Executor nativo do Node (`node:test`) e `node:assert/strict`. Sem Jest, Mocha nem Supertest: os testes HTTP sobem o
  app com `app.listen(0)` e chamam com `fetch`.
- Dependências externas são trocadas por injeção: cada service é criado por uma fábrica `createXService({ repository,
  mailer, gateway, audit, … })`, e os testes passam versões falsas.
- Sem ferramenta de cobertura configurada (nem `c8` nem `--experimental-test-coverage`). ⚠️ A confirmar se há meta de
  cobertura.

## Como rodar

| Comando | O que roda | Precisa de banco? |
| --- | --- | --- |
| `npm test` | `node --test tests/unit/*.test.js` — 20 arquivos, **109 testes** | Não |
| `npm run test:integration` | `node --test --test-concurrency=1 tests/integration/*.test.js` — 1 teste com 14 subtestes | Sim (`DATABASE_URL`); sem ela, o teste é pulado |
| `INTEGRACAO_BANCO_VAZIO=1 npm run test:integration` | Igual, mas cria um schema vazio a partir de `migrations/ordem.json` (simula o banco do CI) | Sim |

Resultado em 2026-10-07: `npm test` → 109 aprovados, 0 falhas (≈ 1 s).

## Testes de integração (`tests/integration/api-flows.test.js`)

Rodam **no banco real dentro de uma transação que sempre é desfeita** (`tests/helpers/db-transaction.js`,
`withRollback`): `pool.query` passa a usar a mesma conexão, cada escrita ganha um `SAVEPOINT` (para erros esperados
não abortarem a transação) e os `BEGIN/COMMIT` da aplicação viram savepoints. Nada fica gravado. Fotos vão para uma
pasta temporária apagada ao final. E-mails de teste usam o sufixo `.integracao@example.invalid`.

| # | Subteste |
| --- | --- |
| 1 | Login, renovação por cookie, `/me` e troca de senha |
| 2 | Sessões revogáveis, esqueci a senha, link de redefinição e convite |
| 3 | Animais: cadastro, máquina de estados, exportação e visão pública |
| 4 | Fotos: upload, arquivo servido, principal, remoção e temperamento no perfil público |
| 5 | Adoção: pedido público, triagem, aprovação em transação e termo |
| 6 | Agenda: data preferida, conflito de horário, remarcação, cancelamento e painel |
| 7 | Adoção: reprovar o último pedido devolve o animal para disponível |
| 8 | Adotantes: mascaramento, revelação, exportação LGPD, anonimização e exclusão |
| 9 | Doações: registro, resumo pelas views, cancelamento definitivo e CSV |
| 10 | Doações online: SQL real com gateway simulado, status público e painel |
| 11 | Voluntários: áreas em transação, inscrição pública idempotente e exclusão |
| 12 | Histórias: só aparecem no site depois de publicadas e sem dados do adotante |
| 13 | Equipe: política de senha, proteções do administrador e desativação |
| 14 | Dashboard e conteúdo público |

## Testes unitários (`tests/unit/`)

| Arquivo | Testes | O que cobre |
| --- | ---: | --- |
| `adopter-service.test.js` | 3 | Máscara de contatos (inclusive em observações), revelação auditada, anonimização bloqueada com pedido aberto |
| `adoption-request-service.test.js` | 5 | Pedido público: novo adotante e protocolo, reuso sem sobrescrever, corrida na inserção, animal ausente/indisponível/já pedido, validador |
| `adoption-triage-service.test.js` | 14 | Aprovação com reprovação automática, animal já adotado, liberação do animal, pedidos encerrados, responsável, termo, agendamento/remarcação/cancelamento, conflito de horário, e-mail com e sem SMTP |
| `animal-photos.test.js` | 5 | Tipo pelo conteúdo, primeira foto vira principal, rejeição antes de gravar, troca/remoção da principal, 410 do perfil público |
| `animal-service.test.js` | 5 | Filtros e paginação, lista pública, padrões na criação, FK → 409, 404 |
| `animal-status-rules.test.js` | 3 | Transições permitidas, restrições do administrador, motivo obrigatório |
| `auth-service.test.js` | 4 | Login, erro igual para usuário inexistente e senha errada, usuário inativo, conta desativada |
| `dashboard-service.test.js` | 3 | Série de 12 meses e indicadores, cache curto, números públicos |
| `definir-senha.test.js` | 3 | Script de senha: hash bcrypt, e-mail desconhecido, política de senha |
| `donation-service.test.js` | 3 | Conversão de valores, máscara de e-mail, cancelamento definitivo e auditoria |
| `email.test.js` | 3 | SMTP opcional, transporte reutilizado, validação do agendamento |
| `http-foundation.test.js` | 12 | Cabeçalhos e `requestId`, JSON malformado, 401 comum, validação antes do banco, RBAC, rotas antigas removidas, cargo lido do banco |
| `http-permissions.test.js` | 7 | Cada cargo só alcança sua matriz, sessão obrigatória, confirmações LGPD, CSRF no refresh, `no-store`, rotas públicas |
| `migrar.test.js` | 2 | Ordem das migrations, só pendentes aplicadas, checksum de arquivo aplicado |
| `online-donations.test.js` | 6 | Assinatura do webhook, mapa de métodos, Checkout Pro, webhook forjado, sincronização de pagamento/assinatura/cobrança, 503 sem credenciais |
| `openapi-coverage.test.js` | 1 | Toda rota registrada está em `docs/openapi.yaml` e vice-versa |
| `security-utils.test.js` | 8 | CSV contra fórmulas, máscaras, cookies, política de senha, rate limit, bloqueio de login, rotação do refresh, refresh de usuário desativado |
| `sessions-and-reset.test.js` | 6 | Logout revoga, troca de senha mantém só a sessão atual, esqueci a senha uniforme, link de uso único, hash do token, sem SMTP não cria link |
| `shared.test.js` | 11 | Envelopes de resposta, paginação, validação, configuração de ambiente, matriz de permissões, segredo de desenvolvimento, `docs/permissoes.md` em dia |
| `user-service.test.js` | 5 | Criação com senha forte, autoalteração bloqueada, último administrador, convite, sessões encerradas |

Auxiliares (`tests/helpers/`): `db-transaction.js` (`withRollback`), `fake-sessions.js` (repositório de sessões em
memória) e `fake-users.js` (um usuário fictício por cargo + `signToken`).

## O que não tem teste unitário próprio

`volunteer-service`, `story-service`, `public-controller`/rotas públicas além da validação, todos os repositories e o
`mercado-pago-client` (só a verificação de assinatura). Voluntários, histórias e as consultas SQL são exercitados
apenas pelo teste de integração, que só roda com banco.

## No CI

O workflow `backend-ci.yml` roda `npm test`, aplica as migrations num PostgreSQL 16 vazio e roda
`npm run test:integration` contra ele (ver [15. Deploy](15-deploy.md)).
