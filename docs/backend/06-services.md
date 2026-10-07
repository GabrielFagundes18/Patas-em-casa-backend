# 6. Services e regras de negócio

Cada service é criado por uma fábrica `createXService(dependências)` e o módulo exporta a instância padrão mais a
fábrica (os testes injetam repositórios, relógio, e-mail e gateway falsos). Exceções são sempre `AppError(status,
código, mensagem, details)`; o tratador de erros transforma em resposta (ver [9. Validações e erros](09-validacoes-e-erros.md)).
`actor` é o contexto de auditoria `{ userId, role, name, ip, userAgent }` montado por `auditContext(req)`.

Os serviços de integração (e-mail, Mercado Pago, fotos) estão em [10. Integrações externas](10-integracoes.md).

---

## `auth-service` (`src/modules/auth/auth-service.js`)

Login, sessões, renovação, troca e redefinição de senha. Dependências: `user-repository`, `session-repository`,
`login-throttle`, `access-link-service`, `bcryptjs`, `jsonwebtoken`, `withTransaction`.

| Método | Parâmetros | Retorno | Exceções | Regras |
| --- | --- | --- | --- | --- |
| `login` | `{ email, password }`, `{ userAgent }` | `{ token, refreshToken, user }` | 422 `VALIDACAO_INVALIDA`; 429 `LOGIN_BLOQUEADO`; 401 `CREDENCIAIS_INVALIDAS` | E-mail normalizado; hash fictício contra enumeração por tempo; registra falha/sucesso no bloqueio; cria a sessão |
| `refresh` | `refreshToken` (cookie) | `{ token, refreshToken, user }` | 401 `SESSAO_EXPIRADA`, 401 `SESSAO_INVALIDA` | Exige `typ: refresh`, `sid`, `auth_time` dentro de `SESSION_MAX_HOURS`, sessão ativa do mesmo usuário e usuário ativo; atualiza `ultimo_uso_em`; mantém `auth_time` |
| `logout` | `refreshToken` | — | nenhuma | Revoga a sessão se o token for válido (mesmo expirado) |
| `getCurrentUser` | `id` | `{ id, nome, email, cargo, permissions }` | 401 `SESSAO_INVALIDA` | Usuário ativo e com permissões |
| `changeOwnPassword` | `userId`, `{ senha_atual, nova_senha }`, `{ sessionId }` | — | 401 `SESSAO_INVALIDA`; 422 `SENHA_ATUAL_INCORRETA`; 422 `SENHA_FRACA` | Política de senha; nova ≠ atual; revoga as outras sessões |
| `requestPasswordReset` | `{ email }` | — | nenhuma | Só usuários ativos; envio em segundo plano (resultado só no log) |
| `resetPassword` | `{ token, nova_senha }` | `{ email, finalidade, usuarioId }` | 422 `SENHA_FRACA`; 400 `LINK_INVALIDO` | Transação: consome o link, troca a senha, revoga todas as sessões |

Funções internas: `issueAccessToken` (JWT com `sub`, `email`, `role`, `nome`, `sid`) e `issueRefreshToken`
(`sub`, `typ`, `auth_time`, `sid`; validade `SESSION_IDLE_MINUTES`). Exporta também `serializeUser`.

## `access-link-service` (`src/modules/auth/access-link-service.js`)

Links por e-mail de redefinição (1 h) e convite (72 h).

| Método | Parâmetros | Retorno | Regras |
| --- | --- | --- | --- |
| `issue` | `user`, `finalidade` | `{ url, validadeHoras }` | Token aleatório de 32 bytes (base64url); invalida links pendentes do usuário; grava só o SHA-256; URL `<FRONTEND_URL>/admin/redefinir-senha?token=…` (+ `&convite=1`) |
| `send` | `user`, `finalidade` | `{ enviado: true }` ou `{ enviado: false, motivo }` | Sem SMTP não cria link; falha de SMTP vira `enviado: false` e log `email_acesso_falhou` |
| `consume` | `db`, `token` | link ou `null` | Dentro da transação do chamador: trava o link (`FOR UPDATE`), exige usuário ativo e marca todos os pendentes como usados |

Exporta também `hashToken` (SHA-256).

## `login-throttle` (`src/modules/auth/login-throttle.js`)

Bloqueio por conta, **em memória** (por instância da API).

| Método | Regras |
| --- | --- |
| `check(email)` | `{ locked, retryAfterMs }` |
| `registerFailure(email)` | A cada 5 falhas seguidas, bloqueia por 15 min × 2^(bloqueios−1), até 4 h; acima de 10.000 contas rastreadas, limpa as desbloqueadas |
| `registerSuccess(email)` | Zera o registro da conta |

A chave é o e-mail digitado (exista ou não a conta).

## `user-service` (`src/modules/users/user-service.js`)

Equipe e acessos. Dependências: `user-repository`, `session-repository`, `audit-service`, `access-link-service`, bcrypt.

| Método | Parâmetros | Retorno | Exceções | Regras |
| --- | --- | --- | --- | --- |
| `list` | query | `{ items, total }` | — | Itens com `permissions` |
| `getById` | `id` | usuário | 404 `USUARIO_NAO_ENCONTRADO` | |
| `create` | payload, actor | usuário + `convite` | 422 `SENHA_FRACA`; 409 `EMAIL_EM_USO` | Sem senha e com convite: senha aleatória; auditoria `criar`; envia convite se pedido |
| `sendInvite` | `id`, actor | `{ enviado, motivo? }` | 404; 409 `USUARIO_INATIVO` | Auditoria `enviar_convite` |
| `update` | `id`, payload, actor | usuário | 404; 409 `ALTERACAO_PROPRIA_BLOQUEADA`; 409 `ULTIMO_ADMINISTRADOR`; 409 `EMAIL_EM_USO` | Desativar revoga as sessões; auditoria `editar` (só campos alterados) |
| `resetPassword` | `id`, `{ nova_senha }`, actor | — | 404; 422 `SENHA_FRACA` | Revoga todas as sessões; auditoria `redefinir_senha` |

## `audit-service` (`src/modules/audit/audit-service.js`)

| Função | Regras |
| --- | --- |
| `auditContext(req)` | `{ userId, role, name, ip, userAgent (até 500) }` |
| `record(event, db?)` | Grava em `auditoria_eventos` (usuário, cargo, ação, módulo, entidade, id, IP, navegador, antes/depois em JSON) **se a tabela existir**; recebe o cliente da transação quando a ação é transacional. Sem a tabela (hoje: migration 001 não aplicada), escreve o evento `audit_event` no log só com identificadores — **antes/depois não são guardados** |

`audit-repository.isAvailable` consulta `to_regclass('public.auditoria_eventos')` e, enquanto a tabela não existe, só
reconsulta a cada 60 s. Ações registradas: ver a lista em [12. Logs e monitoramento](12-logs.md#auditoria).

## `animal-service` (`src/modules/animals/animal-service.js`)

Dependências: `animal-repository`, `animal-media-repository`, `audit-service`, `photo-storage`, `animal-status-rules`.

| Método | Parâmetros | Retorno | Exceções | Regras |
| --- | --- | --- | --- | --- |
| `list` | query | `{ items, total }` | — | Filtros normalizados; padrão `data_entrada desc` |
| `listPublicPage` | query | `{ items, total }` | — | Só `disponivel`/`urgente`, campos públicos |
| `getPublicById` | `id` | animal público + fotos | 410 `ANIMAL_INDISPONIVEL`; 404 `ANIMAL_NAO_ENCONTRADO` | 410 para `adotado`/`em_processo` com o nome |
| `listForExport` | query | linhas | 422 `EXPORTACAO_MUITO_GRANDE` | Até 10.000 |
| `getById` / `getDetail` | `id` | animal / animal + fotos | 404 | |
| `create` | payload, actor | animal | 403 `TRANSICAO_NAO_PERMITIDA` | Padrões do schema; temperamento normalizado; auditoria `criar` |
| `update` | `id`, payload, actor | animal | 404; regras de status | Só campos editáveis; auditoria `editar`/`alterar_status` com diferenças |
| `changeStatus` | `id`, `{ status, motivo }`, actor | animal | idem | Chama `update` |
| `remove` | `id`, actor | animal removido | 404; 409 `ANIMAL_COM_PEDIDO` | Apaga arquivos das fotos; auditoria `excluir` |
| `addPhotos` | `id`, arquivos, actor | animal + fotos | 404; 422 `ARQUIVO_INVALIDO`; 422 `LIMITE_DE_FOTOS` | Confere todos antes de gravar; 1ª foto vira principal e `foto_url`; auditoria `adicionar_fotos` |
| `setPrincipalPhoto` | `id`, `photoId`, actor | animal + fotos | 404 `ANIMAL_NAO_ENCONTRADO`/`FOTO_NAO_ENCONTRADA` | Atualiza `foto_url`; auditoria |
| `removePhoto` | `id`, `photoId`, actor | animal + fotos | idem | Promove a próxima ou limpa `foto_url`; auditoria |
| `listAll`, `listPublic` | filtros | lista completa (páginas de 100) | — | ⚠️ Sem uso nas rotas (só `listPublic` aparece em teste) |

## `animal-status-rules` (`src/modules/animals/animal-status-rules.js`)

`assertStatusTransition({ from, to, role, motivo })` — máquina de estados descrita em
[animais.md](04-endpoints/animais.md#patch-apiv1animalsidstatus--mudar-o-status). Exceções: 403
`TRANSICAO_NAO_PERMITIDA`, 409 `TRANSICAO_INVALIDA`, 422 `MOTIVO_OBRIGATORIO`.

## `adoption-request-service` (`src/modules/adoptions/adoption-request-service.js`)

| Método | Parâmetros | Retorno | Exceções | Regras |
| --- | --- | --- | --- | --- |
| `create` | payload do formulário | `{ protocolo, status, data_pedido, animal }` | 422 `DATA_NO_PASSADO`; 404 `ANIMAL_NAO_ENCONTRADO`; 409 `ANIMAL_INDISPONIVEL`; 409 `PEDIDO_EM_ANDAMENTO` | Transação; animal `FOR SHARE`; adotante por e-mail sem sobrescrever; um pedido aberto por e-mail+animal; observações montadas do formulário |

## `adoption-triage-service` (`src/modules/adoptions/adoption-triage-service.js`)

Triagem, decisão, agenda e e-mails ao adotante. Dependências: `adoption-triage-repository`, `appointment-repository`,
`audit-service`, `mailer`, `withTransaction`, relógio.

| Método | Retorno | Exceções | Regras principais |
| --- | --- | --- | --- |
| `list(query)` | `{ items, total }` | — | Contatos mascarados |
| `board({ incluirReprovados })` | `{ columns }` | — | 50 por coluna, por prioridade |
| `getById(id)` | detalhe | 404 `PEDIDO_NAO_ENCONTRADO` | Observações mascaradas |
| `reveal(id, actor)` | contatos + observações | 404 | Auditoria `revelar_dados_pedido` |
| `update(id, payload, actor)` | detalhe | 404; 409 `PEDIDO_ENCERRADO`; 422 `RESPONSAVEL_INVALIDO` | Transação com `FOR UPDATE`; status do adotante acompanha; nota no histórico |
| `approve(id, payload, actor)` | detalhe + `email` | 404; 409 `PEDIDO_ENCERRADO`, `ANIMAL_JA_ADOTADO`, `ANIMAL_INATIVO` | Animal `adotado`, adotante `adotante`, outros pedidos abertos reprovados automaticamente |
| `reject(id, payload, actor)` | detalhe + `email` | 404; 409 `PEDIDO_ENCERRADO` | Cancela agendamentos; libera o animal `em_processo` sem outros pedidos |
| `schedule(id, payload, actor)` | `{ pedido, agendamento, email }` | 422 `DATA_NO_PASSADO`; 404; 409 `PEDIDO_ENCERRADO`; 422 `RESPONSAVEL_INVALIDO`; 409 `HORARIO_INDISPONIVEL` | Trava de agenda + conflito; visita → `visita_agendada` |
| `reschedule(id, appointmentId, payload, actor)` | idem | + 404 `AGENDAMENTO_NAO_ENCONTRADO`; 409 `AGENDAMENTO_ENCERRADO` | Conflito ignorando o próprio |
| `cancelAppointment(id, appointmentId, payload, actor)` | idem | 404; 404/409 do agendamento | Reabre para `em_analise` se era a única visita |
| `completeAppointment(id, appointmentId, actor)` | `{ pedido }` | 404; 404/409 do agendamento | Status `realizado` |
| `markTermSigned(id, actor)` | detalhe | 404; 409 `PEDIDO_NAO_APROVADO`; 409 `TERMO_JA_ASSINADO` | |

Funções internas relevantes: `appendNote` (histórico com data/autor), `releaseAdopter` (adotante sem pedidos abertos
vira `inativo`), `notifyAdopter` (envia depois de gravar e anota o resultado no histórico numa transação própria; falha
de anotação só vai ao log `historico_email_falhou`), `resolveResponsible`, `assertNoConflict`, `assertFuture`.

## `adopter-service` (`src/modules/adopters/adopter-service.js`)

| Método | Retorno | Exceções | Regras |
| --- | --- | --- | --- |
| `list(query)` | `{ items, total }` | — | Mascarados, endereço omitido |
| `getById(id)` | adotante + histórico | 404 `ADOTANTE_NAO_ENCONTRADO` | Observações e e-mails do histórico mascarados |
| `reveal(id, actor)` | `{ id, email, telefone, endereco }` | 404 | Auditoria `revelar_contato` |
| `update(id, payload, actor)` | adotante mascarado | 404; 409 `EMAIL_EM_USO` | Vazio → `null`; auditoria `editar` |
| `listForExport(query, { revealContacts }, actor)` | linhas | 422 `EXPORTACAO_MUITO_GRANDE` | Mascara sem `adopters:reveal`; auditoria `exportar`/`exportar_com_contatos` |
| `exportTitularData(id, actor)` | documento completo | 404 | Auditoria `lgpd_exportar` |
| `anonymize(id, actor)` | `{ id, anonimizado: true }` | 404; 409 `TITULAR_JA_ANONIMIZADO`; 409 `PEDIDOS_EM_ANDAMENTO` | Transação; limpa vínculos; auditoria sem valores antigos |
| `remove(id, actor)` | — | idem | Transação; limpa vínculos e apaga (pedidos em cascata) |

## `donation-service` (`src/modules/donations/donation-service.js`)

| Método | Retorno | Exceções | Regras |
| --- | --- | --- | --- |
| `list(query)` | `{ items, total }` | — | `valor` numérico; e-mail mascarado |
| `getById(id)` | doação | 404 `DOACAO_NAO_ENCONTRADA` | |
| `create(payload, actor)` | doação | 422 `ADOTANTE_INVALIDO` | Status padrão `confirmada`; auditoria `criar` |
| `update(id, payload, actor)` | doação | 404; 409 `DOACAO_CANCELADA`; 409 `DOACAO_ONLINE`; 422 `ADOTANTE_INVALIDO` | Auditoria `alterar_status`/`editar` |
| `summary(query)` | resumo | — | Por status (todas), por método/tipo (confirmadas); mês atual pela view |
| `monthly(query)` | série | — | View `vw_doacoes_por_mes`, padrão 12 meses |
| `listForExport(query, actor)` | linhas | 422 `EXPORTACAO_MUITO_GRANDE` | Mascarado; auditoria `exportar` |

## `online-donation-service` (`src/modules/donations/online-donation-service.js`)

Dependências: `online-donation-repository`, `mercado-pago-client` (criado só com `MERCADOPAGO_ACCESS_TOKEN`), `mailer`,
`audit-service`.

| Método | Retorno | Exceções | Regras |
| --- | --- | --- | --- |
| `isAvailable()` | booleano | — | Há gateway configurado (⚠️ só usado em testes) |
| `startCheckout({ valor, nome, email, tipo })` | `{ tipo, referencia, checkout_url }` | 503 `PAGAMENTO_INDISPONIVEL`; 502 `GATEWAY_INDISPONIVEL` | Cria a doação/assinatura `pendente` e depois a preferência/preapproval |
| `getPublicStatus(ref)` | `{ tipo, status, valor }` | 404 `DOACAO_NAO_ENCONTRADA` | Doação ou assinatura |
| `handleWebhook({ headers, query, body })` | `{ status }` | 503; 401 `ASSINATURA_INVALIDA`; 502 | Assinatura, idempotência, consulta ao MP (detalhes em [doacoes.md](04-endpoints/doacoes.md#post-apiv1webhooksmercadopago--notificações-do-mercado-pago)) |
| `requestCancelLink({ email })` | — | — | Resposta sempre igual; link de 7 dias por assinatura |
| `cancelByToken({ token })` | `{ status, valor }` | 400 `LINK_INVALIDO`; 503; 502 | Cancela no MP e localmente |
| `listSubscriptions(query)` | `{ items, total }` | 400 `PARAMETRO_INVALIDO` (paginação) | Soma pagamentos confirmados |
| `cancelSubscriptionById(id, actor)` | assinatura | 404 `ASSINATURA_NAO_ENCONTRADA`; 503; 502 | Auditoria `cancelar_assinatura` |

Funções internas: `syncPayment`, `syncSubscription` (envia o e-mail de "ativa" com link de cancelamento),
`syncAuthorizedPayment`, `issueCancelLink`, `sendEmail` (falha só no log). Exporta `PAYMENT_STATUS` e `paymentMethod`.

## `dashboard-service` (`src/modules/dashboard/dashboard-service.js`)

| Método | Retorno | Regras |
| --- | --- | --- |
| `summary({ fresh })` | indicadores do painel | 11 consultas em paralelo; série de 12 meses sem buracos; cache em memória de 15 s |
| `publicStats()` | `{ animais_resgatados, adocoes_realizadas, aguardando_lar }` | Só contagens agregadas |

## `story-service` (`src/modules/stories/story-service.js`)

| Método | Retorno | Exceções | Regras |
| --- | --- | --- | --- |
| `list(query)` | `{ items, total }` | — | Ordem por `criado_em` |
| `getById(id)` | história | 404 `HISTORIA_NAO_ENCONTRADA` | |
| `create(payload, actor)` | história | 422 `VINCULO_INVALIDO` | Padrão `publicado: false`; auditoria `criar` |
| `update(id, payload, actor)` | história | 404; 422 `VINCULO_INVALIDO` | Auditoria `publicar`/`despublicar`/`editar` |
| `remove(id, actor)` | — | 404 | Auditoria `excluir` |
| `listPublished(query)` | `{ items, total }` | — | Só publicadas, sem dados do adotante |

## `volunteer-service` (`src/modules/volunteers/volunteer-service.js`)

| Método | Retorno | Exceções | Regras |
| --- | --- | --- | --- |
| `list(query)` | `{ items, total }` | — | Com áreas |
| `getById(id)` | voluntário | 404 `VOLUNTARIO_NAO_ENCONTRADO` | |
| `create(payload, actor)` | voluntário | 409 `EMAIL_EM_USO` | Transação (voluntário + áreas); auditoria `criar` |
| `update(id, payload, actor)` | voluntário | 404; 409 `EMAIL_EM_USO` | Transação; `areas` substitui todas; auditoria `editar` |
| `remove(id, actor)` | — | 404 | Auditoria `excluir` |
| `apply(payload)` | `{ protocolo, status: 'recebida' }` | — | Idempotente por e-mail; entra `inativo`; auditoria `inscricao_publica` |

## `adoption-step-service` (`src/modules/content/adoption-step-service.js`)

`listActive()` → `[{ ordem, titulo, descricao }]` das etapas com `is_active` diferente de `false`, por `step_order`.
