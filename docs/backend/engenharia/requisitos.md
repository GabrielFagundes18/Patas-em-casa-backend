# Requisitos

Requisitos **extraídos do código** (engenharia reversa): o que a API faz hoje, não um levantamento com a ONG.

| Status | Significado |
| --- | --- |
| Implementado | O comportamento existe no código e tem rota/regra identificável |
| Parcialmente implementado | Existe, mas com lacuna conhecida (descrita na linha e em [16. Pontos de atenção](../16-pontos-de-atencao.md)) |
| ⚠️ inferido, confirmar | O código sugere a intenção, mas ela não está explícita (comentário, nome ou documento ausente); precisa de confirmação |

Atores: **Visitante** (site, sem login), **Membro da equipe** (painel; um dos 5 cargos), **Administrador**,
**Mercado Pago** (sistema externo), **Servidor SMTP** (sistema externo).

## 1. Requisitos funcionais

### Site público

| ID | Requisito | Ator | Endpoints | Status |
| --- | --- | --- | --- | --- |
| RF01 | Listar os animais disponíveis para adoção, com filtros e paginação | Visitante | `GET /public/animals` | Implementado |
| RF02 | Exibir o perfil público de um animal com galeria de fotos e temperamento; avisar quando já foi adotado ou está em processo | Visitante | `GET /public/animals/:id` | Implementado |
| RF03 | Listar histórias de adoção publicadas, sem dados do adotante | Visitante | `GET /public/stories` | Implementado |
| RF04 | Exibir as etapas do processo de adoção | Visitante | `GET /public/adoption-steps` | Parcialmente implementado (só leitura; não há cadastro das etapas pela API) |
| RF05 | Exibir números agregados (animais, adoções etc.) | Visitante | `GET /public/stats` | Implementado |
| RF06 | Enviar pedido de adoção e receber um protocolo | Visitante | `POST /public/adoption-requests` | Implementado |
| RF07 | Inscrever-se como voluntário e receber um protocolo | Visitante | `POST /public/volunteers` | Implementado |
| RF08 | Doar online (única ou mensal) pelo Mercado Pago | Visitante, Mercado Pago | `POST /public/donations/checkout` | Implementado |
| RF09 | Consultar a situação da doação na volta do pagamento | Visitante | `GET /public/donations/status/:ref` | Implementado |
| RF10 | Pedir por e-mail o link de cancelamento da doação mensal | Visitante, SMTP | `POST /public/donations/subscriptions/cancel-link` | Implementado |
| RF11 | Cancelar a doação mensal pelo link recebido | Visitante, Mercado Pago | `POST /public/donations/subscriptions/cancel` | Implementado |

### Acesso ao painel

| ID | Requisito | Ator | Endpoints | Status |
| --- | --- | --- | --- | --- |
| RF12 | Entrar no painel com e-mail e senha | Membro | `POST /auth/login` | Implementado |
| RF13 | Manter a sessão ativa sem novo login (renovação) | Membro | `POST /auth/refresh` | Implementado |
| RF14 | Sair do painel | Membro | `POST /auth/logout` | Implementado |
| RF15 | Recuperar o acesso por link enviado por e-mail | Membro, SMTP | `POST /auth/forgot-password`, `POST /auth/reset-password` | Implementado |
| RF16 | Consultar o próprio perfil e as permissões | Membro | `GET /me` | Implementado |
| RF17 | Trocar a própria senha | Membro | `PATCH /me/password` | Implementado |

### Painel

| ID | Requisito | Ator | Endpoints | Status |
| --- | --- | --- | --- | --- |
| RF18 | Ver indicadores (animais, pedidos, adoções e doações por mês, agenda) | Membro | `GET /dashboard/summary` | Implementado |
| RF19 | Listar e buscar animais | Membro | `GET /animals`, `GET /animals/:id` | Implementado |
| RF20 | Cadastrar animal | Membro | `POST /animals` | Implementado |
| RF21 | Editar os dados do animal | Membro | `PUT /animals/:id` | Implementado |
| RF22 | Mudar o status do animal seguindo a máquina de estados | Membro, Administrador | `PATCH /animals/:id/status` | Implementado |
| RF23 | Excluir animal sem pedidos | Membro | `DELETE /animals/:id` | Implementado |
| RF24 | Gerenciar as fotos do animal (enviar, escolher a principal, remover) | Membro | `POST /animals/:id/photos`, `PATCH …/photos/:photoId/principal`, `DELETE …/photos/:photoId` | Implementado |
| RF25 | Exportar animais em CSV | Membro | `GET /animals/export` | Implementado |
| RF26 | Listar pedidos de adoção com filtros e em quadro por status | Membro | `GET /adoption-requests`, `GET /adoption-requests/board` | Implementado |
| RF27 | Ver o pedido com contatos mascarados e revelar os contatos quando autorizado | Membro | `GET /adoption-requests/:id`, `POST /adoption-requests/:id/reveal` | Implementado |
| RF28 | Triar o pedido: mover entre status abertos, prioridade, responsável, anotações | Membro | `PATCH /adoption-requests/:id` | Implementado |
| RF29 | Agendar visita ou entrevista, com aviso opcional ao adotante | Membro, SMTP | `POST /adoption-requests/:id/schedule` | Implementado |
| RF30 | Remarcar, cancelar e concluir agendamentos | Membro, SMTP | `PATCH …/appointments/:appointmentId`, `POST …/cancel`, `POST …/complete` | Implementado |
| RF31 | Aprovar ou reprovar o pedido, com aviso opcional ao adotante | Membro, SMTP | `POST /adoption-requests/:id/approve`, `/reject` | Implementado |
| RF32 | Registrar que o termo de adoção foi assinado | Membro | `POST /adoption-requests/:id/term-signed` | Implementado |
| RF33 | Listar e ver adotantes com contatos mascarados; revelar contatos | Membro | `GET /adopters`, `GET /adopters/:id`, `POST /adopters/:id/reveal` | Implementado |
| RF34 | Editar dados do adotante | Membro | `PATCH /adopters/:id` | Implementado |
| RF35 | Exportar adotantes em CSV | Membro | `GET /adopters/export` | Implementado |
| RF36 | Atender direitos do titular (LGPD): exportar dados, anonimizar, excluir | Administrador | `GET /adopters/:id/lgpd-export`, `POST /adopters/:id/anonymize`, `DELETE /adopters/:id` | Implementado |
| RF37 | Listar, ver, registrar e editar doações manuais | Membro | `GET /donations`, `GET /donations/:id`, `POST /donations`, `PATCH /donations/:id` | Implementado |
| RF38 | Ver resumo e série mensal de doações | Membro | `GET /donations/summary`, `GET /donations/monthly` | Implementado |
| RF39 | Exportar doações em CSV | Membro | `GET /donations/export` | Implementado |
| RF40 | Listar doações mensais e cancelar uma pelo painel | Membro, Mercado Pago | `GET /donations/subscriptions`, `POST /donations/subscriptions/:id/cancel` | Implementado |
| RF41 | Receber notificações do Mercado Pago e atualizar doações e assinaturas | Mercado Pago | `POST /webhooks/mercadopago` | Parcialmente implementado (notificação que falha não é reprocessada) |
| RF42 | Gerenciar voluntários e suas áreas | Membro | `GET/POST /volunteers`, `GET/PATCH/DELETE /volunteers/:id` | Implementado |
| RF43 | Gerenciar histórias e publicá-las no site | Membro | `GET/POST /stories`, `GET/PATCH/DELETE /stories/:id` | Implementado |
| RF44 | Gerenciar membros da equipe (cadastro, cargo, ativação) | Administrador | `GET/POST /users`, `GET/PATCH /users/:id` | Implementado |
| RF45 | Definir a senha de um membro ou enviar convite para ele criar a própria | Administrador, SMTP | `POST /users/:id/password`, `POST /users/:id/invite` | Implementado |
| RF46 | Consultar a matriz de permissões | Administrador | `GET /permissions` | Implementado |

### Transversais

| ID | Requisito | Onde | Status |
| --- | --- | --- | --- |
| RF47 | Registrar auditoria das ações sensíveis (quem, o quê, quando, antes/depois) | `audit-service` | Parcialmente implementado (hoje só no log, sem antes/depois; a tabela depende da migration 001) |
| RF48 | Enviar e-mails transacionais (acesso, agenda, decisão, doação mensal) | `integrations/email` | Implementado (opcional: sem SMTP, avisa) |
| RF49 | Informar saúde do processo e do banco | `GET /`, `/health`, `/ready` | Implementado |
| RF50 | Servir as fotos enviadas | `GET /uploads/*` | Implementado |

## 2. Requisitos não funcionais

| ID | Categoria | Requisito | Evidência no código | Status |
| --- | --- | --- | --- | --- |
| RNF01 | Segurança | Autenticação por JWT de curta duração + sessão revogável no banco | `middleware/auth.js`, `auth-service`, tabela `sessoes` | Implementado |
| RNF02 | Segurança | Autorização por cargo × módulo × ação, checada em toda rota protegida e com dados lidos do banco | `config/permissions.js`, `requirePermission` | Implementado |
| RNF03 | Segurança | Senhas com bcrypt (12) e política mínima | `utils/password-policy.js` | Implementado |
| RNF04 | Segurança | Proteção contra força bruta e abuso (limites por IP e bloqueio por conta) | `rate-limit.js`, `login-throttle.js` | Parcialmente implementado (em memória, por instância) |
| RNF05 | Segurança | Cabeçalhos de segurança, CORS restrito, proteção CSRF no cookie | `security-headers.js`, `cors`, `csrf.js` | Implementado |
| RNF06 | Segurança | Entradas validadas antes do banco; SQL parametrizado; upload pelo conteúdo | Validadores, repositories, `photo-storage` | Implementado |
| RNF07 | Privacidade (LGPD) | Dados pessoais mascarados por padrão, revelação auditada, logs sem dados pessoais | `utils/masking.js`, `utils/logger.js` | Parcialmente implementado (voluntários e assinaturas sem máscara; sem registro de consentimento) |
| RNF08 | Rastreabilidade | Trilha de auditoria consultável | `audit-service` | Parcialmente implementado (ver RF47) |
| RNF09 | Integridade | Operações compostas em transação, com bloqueio de linha onde há concorrência | `db/transaction.js`, `FOR UPDATE` na triagem e LGPD | Parcialmente implementado (fotos e várias edições sem transação) |
| RNF10 | Integridade | Pagamentos idempotentes | `X-Idempotency-Key`, `gateway_webhook_eventos`, índice único de `gateway_pagamento_id` | Parcialmente implementado (ver RF41) |
| RNF11 | Desempenho | Listas paginadas (padrão 20, máximo 100); exportações até 10.000 linhas; cache de 15 s no painel; corpo JSON até 1 MB | `utils/pagination.js`, `utils/csv.js`, `dashboard-service` | Implementado |
| RNF12 | Desempenho | Timeouts: requisição 30 s, banco/MP/SMTP 10 s | `server.js`, `pool.js`, `mercado-pago-client`, `mailer` | Implementado |
| RNF13 | Disponibilidade | Verificação de vida e prontidão; encerramento gracioso em até 8 s | `health-*`, `server.js`, `HEALTHCHECK` do Docker | Implementado |
| RNF14 | Disponibilidade | Funcionar sem SMTP e sem Mercado Pago configurados (degradação controlada) | `mailer.isConfigured`, `PAGAMENTO_INDISPONIVEL` | Implementado |
| RNF15 | Observabilidade | Logs estruturados em JSON com id de requisição | `utils/logger.js`, `request-context.js` | Parcialmente implementado (sem mensagem/pilha de erro, sem métricas) |
| RNF16 | Interoperabilidade | API versionada (`/api/v1`), envelopes `{data, meta}`/`{error}`, códigos de erro estáveis, OpenAPI sincronizado por teste | `utils/http-response.js`, `docs/openapi.yaml`, `openapi-coverage.test.js` | Implementado |
| RNF17 | Manutenibilidade | Módulos por domínio, services com dependências injetáveis, testes automatizados no CI | `src/modules/`, `tests/`, `backend-ci.yml` | Parcialmente implementado (sem linter, duplicações) |
| RNF18 | Portabilidade | Configuração por variáveis de ambiente validadas; imagem Docker sem root | `config/env.js`, `Dockerfile` | Implementado |
| RNF19 | Localização | Mensagens em português; horário de Brasília nos agendamentos; CSV com `;` e BOM para Excel | Services, `brasilia-time.js`, `csv.js` | Implementado |
| RNF20 | Escalabilidade | Rodar em várias instâncias | — | ⚠️ inferido, confirmar (o estado em memória e o disco local indicam uma instância só) |

## 3. Regras de negócio

| ID | Regra | Onde | Status |
| --- | --- | --- | --- |
| **Animais** | | | |
| RN01 | Só animais `disponivel` ou `urgente` aparecem no site | `domain-values.animal.publicStatus`, `animal-service` | Implementado |
| RN02 | Transições de status permitidas: `disponivel`→`urgente`/`em_processo`/`inativo`; `urgente`→`disponivel`/`em_processo`/`inativo`; `em_processo`→`disponivel`/`urgente`/`adotado`/`inativo`; `adotado`→`disponivel`; `inativo`→`disponivel`/`urgente` | `animal-status-rules.js` | Implementado |
| RN03 | `em_processo → adotado`, `adotado → disponivel` e cadastrar animal já `adotado` são exclusivos do administrador | `animal-status-rules.js` | Implementado |
| RN04 | Inativar e devolver (`adotado → disponivel`) exigem motivo com 5+ caracteres | `animal-status-rules.js` | Implementado |
| RN05 | Animal com pedido de adoção vinculado não pode ser excluído | FK `RESTRICT` + `animal-service.remove` | Implementado |
| RN06 | Até 12 fotos por animal; até 10 por envio, 5 MB cada, só JPG/PNG/WebP (pelo conteúdo) | `animal-service`, `upload.js`, `photo-storage` | Implementado |
| RN07 | A primeira foto vira a principal; a principal define o `foto_url`; remover a principal promove a próxima | `animal-service` | Implementado |
| RN08 | Perfil público de animal adotado ou em processo responde 410 com aviso; inativo ou inexistente, 404 | `animal-service.getPublicById` | Implementado |
| RN09 | Temperamento: até 10 traços de até 40 caracteres | `animal-validators.js` | Implementado |
| **Pedido de adoção (site)** | | | |
| RN10 | Pedido só para animal `disponivel` ou `urgente` | `adoption-request-service` | Implementado |
| RN11 | No máximo um pedido aberto por adotante (e-mail) e animal | `adoption-request-service` | Implementado |
| RN12 | O adotante é identificado pelo e-mail; cadastro existente não é sobrescrito pelo formulário; os contatos informados ficam no pedido | `adoption-request-service` | Implementado |
| RN13 | O formulário exige as confirmações `ambiente_seguro` e `ciente_pos_adocao`; o campo-armadilha `website` preenchido recusa o envio | `adoption-request-validator.js` | Implementado |
| RN14 | O pedido pelo site não muda o status do animal | `adoption-request-service` | ⚠️ inferido, confirmar |
| **Triagem** | | | |
| RN15 | Pela edição, o status só circula entre os abertos (`novo`, `em_analise`, `visita_agendada`); `aprovado`/`reprovado` só pelas ações de decisão | `adoption-triage-validators.js` | Implementado |
| RN16 | Pedido decidido só aceita anotações | `adoption-triage-service.update` | Implementado |
| RN17 | O responsável precisa ser usuário ativo com permissão `adoptions:update` | `adoption-triage-service` | Implementado |
| RN18 | Aprovar exige justificativa (10+ caracteres), recusa animal já adotado ou inativo, marca o animal `adotado` e o adotante `adotante`, e reprova automaticamente os outros pedidos abertos do animal — tudo numa transação | `adoption-triage-service.approve` | Implementado |
| RN19 | Reprovar exige justificativa, cancela os agendamentos ativos e, se o animal está `em_processo` sem outros pedidos abertos, devolve-o para `disponivel` | `adoption-triage-service.reject` | Implementado |
| RN20 | O status do adotante acompanha o pedido (`visita_agendada` ↔ `em_analise`; sem pedidos abertos, deixa de estar em análise) | `adoption-triage-service` | Implementado |
| RN21 | O termo só pode ser marcado em pedido aprovado, uma única vez | `adoption-triage-service.markTermSigned` | Implementado |
| **Agenda** | | | |
| RN22 | Visita/entrevista só no futuro (horário de Brasília) e em pedido aberto; duração de 15 a 480 min (padrão 60) | `adoption-triage-service`, validadores | Implementado |
| RN23 | O mesmo responsável não pode ter compromissos sobrepostos (horários encostados são permitidos) | `assertNoConflict` | Implementado |
| RN24 | Responsável do compromisso: o informado; senão o do pedido; senão quem agenda | `resolveResponsible` | Implementado |
| RN25 | Visita leva o pedido para `visita_agendada`; entrevista só tira de `novo` para `em_analise` | `adoption-triage-service.schedule` | Implementado |
| RN26 | Cancelar a única visita ativa devolve o pedido (e o adotante) para `em_analise` | `cancelAppointment` | Implementado |
| RN27 | Agendamento realizado ou cancelado não pode ser alterado | `lockActiveAppointment` | Implementado |
| **Comunicação** | | | |
| RN28 | E-mail ao adotante só quando pedido (`enviar_email`/`notificar_adotante`), sempre depois de gravar; falha não desfaz a ação; o resultado é anotado no histórico; a justificativa interna nunca vai ao adotante | `notifyAdopter`, `notifyDecision` | Implementado |
| **LGPD** | | | |
| RN29 | Contatos saem mascarados e o endereço é omitido; revelar exige `adopters:reveal` e gera auditoria | `adopter-service`, `adoption-triage-service.reveal` | Implementado |
| RN30 | Exportação de adotantes com contatos completos só para quem também tem `adopters:reveal` | `adopter-controller.exportCsv` | Implementado |
| RN31 | Anonimizar/excluir: só administrador, confirmação digitada (`ANONIMIZAR`/`EXCLUIR`), sem pedidos em andamento e titular ainda não anonimizado | `adopter-service.assertCanErase` | Implementado |
| RN32 | A anonimização preserva pedidos, doações e estatísticas; a auditoria não guarda os valores antigos | `adopter-service.anonymize` | Implementado |
| **Doações** | | | |
| RN33 | Doação cancelada não pode ser alterada | `donation-service.update` | Implementado |
| RN34 | Doação online não pode ser editada à mão; só os webhooks a atualizam | `donation-service.update` | Implementado |
| RN35 | Doação online entre R$ 5 e R$ 10.000, com até 2 casas decimais | `online-donation-validators.js` | Implementado |
| RN36 | O estado do pagamento vem sempre da API do Mercado Pago, nunca do corpo da notificação; notificação sem assinatura válida é recusada | `online-donation-service.handleWebhook` | Implementado |
| RN37 | Link de cancelamento da doação mensal vale 7 dias; o pedido do link responde sempre igual (não revela se existe doação) | `online-donation-service` | Implementado |
| RN38 | Na ativação da assinatura, o doador recebe e-mail de confirmação com o link de cancelamento | `syncSubscription` | Implementado |
| **Voluntários e histórias** | | | |
| RN39 | Inscrição pelo site entra `inativo`; e-mail já cadastrado devolve o mesmo protocolo sem alterar o cadastro | `volunteer-service` | Implementado |
| RN40 | Só histórias publicadas aparecem no site, sem dados do adotante; animal e adotante vinculados precisam existir | `story-repository`, `story-service` | Implementado |
| **Equipe e acesso** | | | |
| RN41 | Ninguém altera o próprio cargo nem desativa a própria conta | `user-service.update` | Implementado |
| RN42 | Sempre deve existir ao menos um administrador ativo | `user-service.update` | Implementado |
| RN43 | Desativar um membro ou redefinir sua senha encerra todas as sessões dele; trocar a própria senha encerra as outras | `user-service`, `auth-service` | Implementado |
| RN44 | Senha com 10+ caracteres, ao menos uma letra e um número, até 72 bytes, diferente da atual na troca | `password-policy.js`, `auth-service` | Implementado |
| RN45 | 5 falhas de login seguidas bloqueiam a conta por 15 min, dobrando até 4 h | `login-throttle.js` | Implementado |
| RN46 | Sessão expira após 30 min sem uso e 12 h no total | `auth-service`, `env.js` | Implementado |
| RN47 | Links de acesso: 1 h (redefinição) ou 72 h (convite), uso único; um novo invalida os anteriores; sem SMTP nenhum link é criado | `access-link-service` | Implementado |
| RN48 | Convite só para membro ativo | `user-service` | Implementado |
| RN49 | Exportações CSV limitadas a 10.000 linhas | `utils/csv.js` | Implementado |

## 4. Matriz de rastreabilidade

Requisito → regras → código → testes. "Integração n" = subteste n de `tests/integration/api-flows.test.js` (lista em
[14. Testes](../14-testes.md)).

| Requisito | Regras | Módulo / arquivo principal | Testes |
| --- | --- | --- | --- |
| RF01 | RN01 | `public-controller`, `animal-service.listPublicPage` | `animal-service.test.js`; integração 3 |
| RF02 | RN08, RN09 | `animal-service.getPublicById` | `animal-photos.test.js`; integração 4 |
| RF03 | RN40 | `story-service`, `story-repository` | integração 12 |
| RF04 | — | `adoption-step-service` | integração 14 |
| RF05 | — | `dashboard-service.publicStats` | `dashboard-service.test.js`; integração 14 |
| RF06 | RN10–RN14 | `adoption-request-service` | `adoption-request-service.test.js`; `http-foundation.test.js`; integração 5 |
| RF07 | RN39 | `volunteer-service.apply` | integração 11 |
| RF08, RF09 | RN35 | `online-donation-service.startCheckout`, `getPublicStatus` | `online-donations.test.js`; integração 10 |
| RF10, RF11 | RN37 | `online-donation-service.requestCancelLink`, `cancelByToken` | integração 10 |
| RF12 | RN44–RN46 | `auth-service.login`, `login-throttle` | `auth-service.test.js`, `security-utils.test.js`; integração 1 |
| RF13, RF14 | RN46 | `auth-service.refresh`/`logout` | `security-utils.test.js`, `sessions-and-reset.test.js`, `http-permissions.test.js`; integração 1, 2 |
| RF15 | RN44, RN47 | `auth-service`, `access-link-service` | `sessions-and-reset.test.js`; integração 2 |
| RF16, RF17 | RN43, RN44 | `auth-service` | `sessions-and-reset.test.js`; integração 1 |
| RF18 | — | `dashboard-service.summary` | `dashboard-service.test.js`; integração 6, 14 |
| RF19–RF21, RF25 | RN49 | `animal-service` | `animal-service.test.js`, `http-foundation.test.js`; integração 3 |
| RF22 | RN02–RN04 | `animal-status-rules` | `animal-status-rules.test.js`; integração 3 |
| RF23 | RN05 | `animal-service.remove` | `animal-service.test.js` |
| RF24 | RN06, RN07 | `animal-service`, `photo-storage` | `animal-photos.test.js`; integração 4 |
| RF26–RF28 | RN15–RN17, RN20, RN29 | `adoption-triage-service` | `adoption-triage-service.test.js`; integração 5 |
| RF29, RF30 | RN22–RN28 | `adoption-triage-service` | `adoption-triage-service.test.js`, `email.test.js`; integração 6 |
| RF31 | RN18, RN19, RN28 | `adoption-triage-service.approve`/`reject` | `adoption-triage-service.test.js`, `http-permissions.test.js`; integração 5, 7 |
| RF32 | RN21 | `adoption-triage-service.markTermSigned` | `adoption-triage-service.test.js`; integração 5 |
| RF33–RF35 | RN29, RN30, RN49 | `adopter-service`, `adopter-controller` | `adopter-service.test.js`; integração 8 |
| RF36 | RN31, RN32 | `adopter-service` | `adopter-service.test.js`, `http-permissions.test.js`; integração 8 |
| RF37–RF39 | RN33, RN34, RN49 | `donation-service` | `donation-service.test.js`; integração 9 |
| RF40 | — | `online-donation-service` | integração 10 |
| RF41 | RN36, RN38 | `online-donation-service.handleWebhook` | `online-donations.test.js`; integração 10 |
| RF42 | RN39 | `volunteer-service` | `http-foundation.test.js`; integração 11 |
| RF43 | RN40 | `story-service` | integração 12 |
| RF44 | RN41, RN42 | `user-service` | `user-service.test.js`; integração 13 |
| RF45 | RN43, RN44, RN47, RN48 | `user-service`, `access-link-service` | `user-service.test.js`, `sessions-and-reset.test.js`; integração 2, 13 |
| RF46 | — | `user-controller.permissionMatrix` (`getPermissionMatrix`) | `http-permissions.test.js`, `shared.test.js` |
| RF47 | — | `audit-service` | `adopter-service.test.js`, `donation-service.test.js` (chamadas de auditoria com fakes) |
| RF48 | RN28, RN38, RN47 | `integrations/email` | `email.test.js` |
| RF49, RF50 | — | `health-controller`, `express.static` | `http-foundation.test.js`; integração 4 |
| RNF01–RNF06 | RN41–RN47 | `middleware/*`, `config/*` | `http-foundation.test.js`, `http-permissions.test.js`, `security-utils.test.js`, `shared.test.js` |
| RNF16 | — | `docs/openapi.yaml` | `openapi-coverage.test.js` |
