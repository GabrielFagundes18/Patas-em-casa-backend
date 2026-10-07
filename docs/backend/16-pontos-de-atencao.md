# 16. Pontos de atenção

Problemas, riscos e dívidas encontrados ao ler o código para esta documentação. Nada aqui foi alterado: a lista serve
para decidir o que corrigir. Cada item diz onde está e o efeito. Os marcados com ⚠️ dependem de uma decisão ou
informação que o código não dá.

## Críticos

| # | Ponto | Onde | Efeito / o que fazer |
| --- | --- | --- | --- |
| C1 | **Senha do banco Neon commitada** no histórico do Git, e o repositório está público no GitHub | Histórico do repositório: `.env.example` do commit `1ad8d5f` (2026-10-05); o arquivo atual já está limpo | Qualquer pessoa pode ler a senha e acessar o banco com dados pessoais. **Trocar a senha no Neon já**, deixar o repositório privado e limpar o histórico (`git filter-branch`/`git filter-repo` + force push) |

## Altos

| # | Ponto | Onde | Efeito |
| --- | --- | --- | --- |
| A1 | Webhook que falha **não é reprocessado**: o evento é gravado antes do processamento; quando dá erro, vira `falhou` e a API responde 500, mas o reenvio do Mercado Pago com o mesmo id cai em `duplicado` | `online-donation-service.handleWebhook`, `registerWebhookEvent` (`ON CONFLICT DO NOTHING`) | Pagamento aprovado pode ficar `pendente` para sempre se a primeira notificação falhar (ex.: MP fora do ar na consulta). ⚠️ A confirmar a regra desejada |
| A2 | Auditoria só no log, **sem antes/depois, IP nem navegador** | `audit-service` + migration 001 não aplicada | Não há trilha consultável de quem alterou o quê. Aplicar a 001 ativa a gravação no banco sem reiniciar |
| A3 | Excluir o titular (LGPD) apaga **em cascata** os pedidos de adoção dele (já encerrados) | FK `pedidos_adocao.adotante_id … ON DELETE CASCADE` (migration 000) | Some o histórico de adoções aprovadas do animal. ⚠️ A confirmar se é o comportamento desejado (a anonimização preserva o histórico) |
| A4 | Campos obrigatórios aceitam `null` no `PATCH` e geram **500** | `textDetail` aceita `null` quando o campo não é `required`; banco `NOT NULL`. Afeta `nome` (adotantes, voluntários), `data_inicio` (voluntários), `autor_nome`/`texto` (histórias), `doador_nome` (doações); em usuários, `nome: null` quebra em `null.trim` | Resposta 500 em vez de 422 |

## Médios

| # | Ponto | Onde | Efeito |
| --- | --- | --- | --- |
| M1 | Rate limit, bloqueio de login e cache do painel **em memória** | `rate-limit.js`, `login-throttle.js`, `dashboard-service.js` | Zeram a cada reinício; com várias instâncias, os limites multiplicam |
| M2 | Uma única instância de limite (10/h) para os **5 formulários públicos** | `public-routes.js` (`publicFormRateLimit`) | Quem envia um pedido de adoção e depois tenta doar soma no mesmo contador; num IP compartilhado (escola, empresa), 10 envios bloqueiam todos |
| M3 | Doação/assinatura `pendente` **órfã** quando o Mercado Pago falha | `startCheckout`: grava no banco, depois chama o MP | Linhas `pendente` sem pagamento nem link; aparecem no painel |
| M4 | Operações de várias etapas **sem transação** | Fotos: arquivo no disco + `INSERT` + `UPDATE foto_url`; `setPrincipal` faz 2 `UPDATE`s e depois o `foto_url`; `update` de animais, doações, histórias, usuários e adotantes faz ação e auditoria separadas | Falha no meio deixa estado inconsistente (ex.: nenhuma foto principal, arquivo sem registro) |
| M5 | E-mails **sem máscara** nas listas de voluntários e de assinaturas mensais | `volunteer-*` (sem `mask`), `online-donation-repository` (`SUBSCRIPTION_COLUMNS` com `doador_email`) | Diferente de adotantes e doações, que mascaram. ⚠️ A confirmar se é intencional |
| M6 | `/ready` decide pelo `DATABASE_URL`, mas o pool usa `DATABASE_URL_DIRECT` primeiro; o README diz que a API usa o *pooler* (`DATABASE_URL`) e a direta só para migrações | `connection-check.js`, `pool.js`, `README.md` | Com as duas definidas, a API usa a conexão direta, ao contrário do README. Só com a direta, `/ready` responde `mock`. ⚠️ A confirmar qual é a intenção |
| M7 | TLS do banco sem verificação de certificado **quando a URL não tem `sslmode`** | `pool.js` (`rejectUnauthorized: false`) | Com `sslmode=verify-full`/`require` na URL (caso do Neon), o `pg` 8 verifica mesmo assim. Sem `sslmode`, aceita certificado falso |
| M8 | O log de erro **não guarda mensagem nem pilha** | `error-handler.js` + lista fechada do `logger.js` | Um 500 em produção só mostra o código `ERRO_INTERNO`; diagnóstico exige reproduzir |
| M9 | `migrations/` fica fora da imagem Docker | `.dockerignore` | `npm run db:migrate` não roda dentro do contêiner |
| M10 | Upload em memória: até 10 × 5 MB = **50 MB por requisição** na RAM | `middleware/upload.js` (`multer.memoryStorage`) | Várias requisições simultâneas podem pressionar a memória |
| M11 | `sessoes`, `tokens_redefinicao_acesso` e `gateway_webhook_eventos` **nunca são limpas** | Não há job (ver [11](11-jobs.md)) | Crescimento contínuo. ⚠️ A confirmar se há limpeza fora do repositório |
| M12 | Sem campo de **consentimento LGPD** nos formulários públicos | Validadores de `public` | O aceite, se existir, fica só no site e não é registrado. ⚠️ A confirmar |

## Baixos

| # | Ponto | Onde | Efeito |
| --- | --- | --- | --- |
| B1 | Data da adoção aproximada por `atualizado_em` do pedido aprovado | `dashboard-repository.js` | Editar uma observação de um pedido aprovado muda o mês contado como "adoção" |
| B2 | Não há API para `adoption_steps` | — | As etapas exibidas no site só mudam direto no banco. ⚠️ A confirmar como são inseridas |
| B3 | O pedido pelo site **não muda o status do animal** (continua `disponivel`/`urgente`) | `adoption-request-service` | Vários pedidos para o mesmo animal até a triagem. ⚠️ A confirmar se é a regra |
| B4 | Fuso fixo UTC-3 nos agendamentos | `utils/brasilia-time.js` | Correto hoje (sem horário de verão desde 2019); quebra se ele voltar |
| B5 | Data padrão de entrada do animal calculada em UTC | `animal-service.js:171` (`new Date().toISOString().slice(0, 10)`) | Cadastro entre 21h e 23h59 (Brasília) recebe a data do dia seguinte. ⚠️ A confirmar |
| B6 | Mês da série de doações agrupado no fuso da sessão do banco | View `vw_doacoes_por_mes` (`date_trunc('month', data)`, migration 000) | Doação na virada do mês pode cair no mês vizinho. ⚠️ A confirmar o fuso do Neon |
| B7 | Token de acesso **sem `sid`** pula a verificação de sessão | `middleware/auth.js` | O código atual sempre emite `sid`, então o ramo só aceitaria um token assinado de outra forma com o mesmo `JWT_SECRET`. ⚠️ A confirmar se o ramo ainda é necessário |
| B8 | Paginação de `GET /donations/subscriptions` não passa pelo validador | `validateListSubscriptions` só confere `status` | `page`/`pageSize` inválidos respondem 400 `PARAMETRO_INVALIDO` em vez de 422 como nas outras listas |
| B9 | `GET /` expõe o `NODE_ENV` (`mode`) | `health-controller.js` | Informação de ambiente pública |
| B10 | Cookie malformado (`%` inválido) gera **500** | `utils/cookies.js` (`decodeURIComponent` sem `try`) em `/auth/refresh` e `/auth/logout` | Erro interno em vez de 401 |
| B11 | Exportação CSV de **animais** não é auditada | `animal-controller.exportCsv` | As exportações de adotantes e doações são |

## Manutenção

| # | Ponto | Onde |
| --- | --- | --- |
| D1 | Código duplicado: `BCRYPT_ROUNDS = 12` (3×: `auth-service`, `user-service`, `scripts/definir-senha.js`), `hashToken` (2×: `access-link-service`, `online-donation-service`), `serializeUser`, `formatProtocol`, validação de telefone (3×), padrão de e-mail próprio no `login-validator` | Vários |
| D2 | `JWT_EXPIRES_IN` e `NODE_ENV` lidos fora do `env.js` | `middleware/auth.js`, `health-controller.js` |
| D3 | `ENCRYPTION_KEY` está no `.env.example` mas não é usada | `.env.example` |
| D4 | Funções sem uso em produção: `animal-service.listAll`/`listPublic`, `online-donation-service.isAvailable` | Services |
| D5 | Sem linter/formatador no back-end | `package.json` |
| D6 | Documentos desatualizados: `docs/migrations-plan.md` fala em "8 tabelas" (as propostas criam 9); a seção "Limitações" do `README.md` não reflete o estado atual | `docs/`, `README.md` |
