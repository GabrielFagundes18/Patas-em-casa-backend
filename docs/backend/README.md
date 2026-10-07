# Documentação do back-end — API Patas em Casa

Documentação completa da API (Node.js + Express + PostgreSQL), escrita **a partir do código** deste repositório em
2026-10-07. Só descreve o que existe; o que é ambíguo está marcado com **⚠️ A confirmar** e o que foi deduzido sem
evidência explícita, com **⚠️ inferido, confirmar** (lista completa no fim desta página).

## Índice

| # | Documento | Conteúdo |
| --- | --- | --- |
| 1 | [Visão geral](01-visao-geral.md) | O que o sistema faz, principais regras, stack |
| 2 | [Como rodar](02-como-rodar.md) | Pré-requisitos, instalação, banco, testes, Docker, **todas as variáveis de ambiente** |
| 3 | [Estrutura](03-estrutura.md) | Árvore de pastas, camadas, arquivos por módulo |
| 4 | [Endpoints](04-endpoints/README.md) | Convenções e as **80 rotas**, uma a uma: [saúde](04-endpoints/saude.md), [público](04-endpoints/publico.md), [autenticação](04-endpoints/autenticacao.md), [dashboard](04-endpoints/dashboard.md), [animais](04-endpoints/animais.md), [pedidos de adoção](04-endpoints/pedidos-adocao.md), [adotantes](04-endpoints/adotantes.md), [doações](04-endpoints/doacoes.md), [voluntários](04-endpoints/voluntarios.md), [histórias](04-endpoints/historias.md), [equipe](04-endpoints/equipe.md) |
| 5 | [Banco de dados](05-banco-de-dados.md) | 16 tabelas com dicionário, views, função, gatilhos, relacionamentos, migrations |
| 6 | [Services](06-services.md) | Os 16 services/módulos de regra: métodos, retornos, exceções, regras |
| 7 | [Autenticação e autorização](07-autenticacao-autorizacao.md) | Tokens, sessões, fluxos, política de senha, matriz de permissões |
| 8 | [Middlewares](08-middlewares.md) | Ordem de execução e o que cada um faz |
| 9 | [Validações e erros](09-validacoes-e-erros.md) | Como se valida, formato de erro, os 59 códigos |
| 10 | [Integrações](10-integracoes.md) | PostgreSQL, SMTP (8 modelos de e-mail), Mercado Pago, fotos em disco |
| 11 | [Jobs](11-jobs.md) | Não há jobs; tarefas em segundo plano e estado em memória |
| 12 | [Logs, monitoramento e auditoria](12-logs.md) | Logger, 18 eventos, monitoramento, 30 ações auditadas |
| 13 | [Segurança](13-seguranca.md) | Controles por tema, LGPD |
| 14 | [Testes](14-testes.md) | Como rodar, os 20 arquivos unitários (109 testes) e os 14 fluxos de integração |
| 15 | [Deploy](15-deploy.md) | CI, imagem Docker, banco, passo a passo |
| 16 | [Pontos de atenção](16-pontos-de-atencao.md) | Riscos e dívidas por gravidade (1 crítico, 4 altos, 12 médios, 11 baixos, 6 de manutenção) |

**Engenharia de software** ([engenharia/](engenharia/)):

| Documento | Conteúdo |
| --- | --- |
| [requisitos.md](engenharia/requisitos.md) | 50 RF, 20 RNF, 49 RN com status, e matriz de rastreabilidade |
| [casos-de-uso.md](engenharia/casos-de-uso.md) | 3 diagramas PlantUML (include/extend) e a especificação de 29 casos de uso |
| [diagrama-classes.md](engenharia/diagrama-classes.md) | Modelo de domínio, enumerações, máquinas de estado e camada de aplicação (Mermaid) |
| [modelo-er.md](engenharia/modelo-er.md) | Diagrama ER (Mermaid) e dicionário de dados |
| [arquitetura.md](engenharia/arquitetura.md) | C4 (contexto, containers, componentes), sequências, 15 decisões, tecnologias, RNF, implantação, riscos |

**Documentos que já existiam (fora desta pasta):** [`docs/openapi.yaml`](../openapi.yaml) (OpenAPI 3 de todas as
rotas, conferido pelo teste `openapi-coverage.test.js` — por isso não foi gerado de novo),
[`docs/permissoes.md`](../permissoes.md) (matriz gerada por `npm run docs:permissoes`),
[`docs/migrations-plan.md`](../migrations-plan.md) e o [`README.md`](../../README.md) do repositório.

## Inventário

Levantado no código antes de escrever.

| Categoria | Quantidade | Onde está documentado |
| --- | ---: | --- |
| Endpoints | 80 (79 da API + `/uploads`) | [4. Endpoints](04-endpoints/README.md) |
| Arquivos de rotas | 13 | [3](03-estrutura.md#arquivos-por-módulo), [8](08-middlewares.md) |
| Controllers / handlers | 12 / 79 | [3](03-estrutura.md#arquivos-por-módulo), [4](04-endpoints/README.md) |
| Services e módulos de regra | 16 | [6. Services](06-services.md) |
| Repositories | 16 | [3](03-estrutura.md#arquivos-por-módulo) |
| Validadores | 12 + `utils/validators.js` | [9](09-validacoes-e-erros.md), [4](04-endpoints/README.md) |
| Middlewares | 9 arquivos | [8. Middlewares](08-middlewares.md) |
| Integrações | 3 (SMTP, Mercado Pago, disco) em 7 arquivos + banco Neon | [10. Integrações](10-integracoes.md) |
| `config` / `db` / `utils` | 3 / 4 / 10 arquivos | [3](03-estrutura.md), [10](10-integracoes.md#banco-de-dados), [13](13-seguranca.md) |
| Tabelas / views / funções / gatilhos | 16 / 2 / 1 / 4 | [5](05-banco-de-dados.md), [modelo-er](engenharia/modelo-er.md) |
| Migrations | 14 + 14 reversões + `ordem.json` (6 aplicadas, 8 propostas) | [5](05-banco-de-dados.md#migrations), [15](15-deploy.md#banco-de-dados) |
| Scripts | 3 (`migrar`, `definir-senha`, `gerar-doc-permissoes`) | [2](02-como-rodar.md), [15](15-deploy.md) |
| Variáveis de ambiente | 25 | [2](02-como-rodar.md#variáveis-de-ambiente) |
| Códigos de erro | 59 (60 combinações status × código) | [9](09-validacoes-e-erros.md#lista-de-códigos-de-erro) |
| Cargos / permissões | 5 / 29 | [7](07-autenticacao-autorizacao.md#papéis-e-permissões) |
| Eventos de log / ações auditadas | 18 / 30 | [12](12-logs.md) |
| Modelos de e-mail | 8 | [10](10-integracoes.md#e-mail-smtp-nodemailer) |
| Testes | 20 arquivos unitários (109 testes), 1 de integração (14 subtestes), 3 auxiliares | [14. Testes](14-testes.md) |
| Jobs agendados | 0 | [11. Jobs](11-jobs.md) |

## Verificação de cobertura

Feita com um script que lê o código e procura cada item nos documentos desta pasta (2026-10-07):

| Categoria | No código | Documentados | Cobertura | Como foi conferido |
| --- | ---: | ---: | :---: | --- |
| Arquivos do projeto (`src`, `scripts`, `tests`, `migrations`, `server.js`, Docker, CI, `package.json`, `.env.example`) | 166 | 166 | 100% | Nome de cada arquivo citado em algum documento |
| Rotas no índice | 80 | 80 | 100% | Método + caminho, extraídos dos routers e de `app.js` |
| Rotas detalhadas no arquivo do módulo | 79 | 79 | 100% | Cada rota da API tem seção própria (`/uploads` está em `saude.md`) |
| Códigos de erro | 59 | 59 | 100% | Todos os `new AppError(status, 'CODIGO'…)`, inclusive em várias linhas |
| Tabelas | 16 | 16 | 100% | Seção no dicionário (5) e entidade no ER |
| Variáveis de ambiente | 25 | 25 | 100% | `env.X`/`process.env.X` no código + `.env.example` |
| Eventos de log | 18 | 18 | 100% | Chamadas `logger.info/error` |
| Ações de auditoria | 30 | 30 | 100% | Valores de `action` passados a `audit.record` |
| Permissões | 29 | 29 | 100% | `getPermissionMatrix()` comparado com a tabela da seção 7 |
| Services | 16 | 16 | 100% | Seção própria na seção 6 |
| Middlewares | 9 | 9 | 100% | Arquivos de `src/middleware` |
| Arquivos de teste unitário | 20 | 20 | 100% | Linha própria na seção 14 |

Também conferidos: **todos os links e âncoras internos** resolvem (0 quebrados); os **19 diagramas Mermaid** passam no
parser do Mermaid 11; os 3 diagramas PlantUML foram revisados manualmente (não havia Java para validá-los).
`npm test` rodou com 109 aprovados e 0 falhas.

## Itens a confirmar

### ⚠️ A confirmar (21)

| # | Ponto | Onde |
| --- | --- | --- |
| 1 | Versão do PostgreSQL em produção (README diz 14+, CI usa 16) | [1](01-visao-geral.md#stack), [2](02-como-rodar.md), [arquitetura](engenharia/arquitetura.md#7-tecnologias) |
| 2 | Onde a API está hospedada e se o volume `/app/uploads` é montado | [15](15-deploy.md), [10](10-integracoes.md#armazenamento-de-fotos-disco), [arquitetura](engenharia/arquitetura.md#9-implantação) |
| 3 | Qual conexão a API usa em produção (`DATABASE_URL_DIRECT` x pooler) e o modo `mock` do `/ready` | [15](15-deploy.md#banco-de-dados), [saúde](04-endpoints/saude.md), [16 M6](16-pontos-de-atencao.md#médios) |
| 4 | `npm run db:migrate` não funciona dentro do contêiner (`migrations/` fora da imagem) | [15](15-deploy.md#imagem-docker-dockerfile) |
| 5 | Notificação do Mercado Pago que falha não é reprocessada no reenvio | [10](10-integracoes.md#webhook-post-apiv1webhooksmercadopago), [doações](04-endpoints/doacoes.md), [16 A1](16-pontos-de-atencao.md#altos) |
| 6 | Excluir titular (LGPD) apaga em cascata os pedidos dele | [16 A3](16-pontos-de-atencao.md#altos) |
| 7 | `null` em campo obrigatório no `PATCH` gera 500 (adotantes, voluntários, histórias, doações, usuários) | Endpoints de [adotantes](04-endpoints/adotantes.md), [voluntários](04-endpoints/voluntarios.md), [histórias](04-endpoints/historias.md), [doações](04-endpoints/doacoes.md), [equipe](04-endpoints/equipe.md); [16 A4](16-pontos-de-atencao.md#altos) |
| 8 | E-mails sem máscara nas listas de voluntários e de assinaturas | [13](13-seguranca.md#privacidade-lgpd), [doações](04-endpoints/doacoes.md), [16 M5](16-pontos-de-atencao.md#médios) |
| 9 | Consentimento LGPD não é registrado pelos formulários públicos | [13](13-seguranca.md#privacidade-lgpd), [16 M12](16-pontos-de-atencao.md#médios) |
| 10 | Se há limpeza de `sessoes`, `tokens_redefinicao_acesso` e `gateway_webhook_eventos` fora do repositório | [11](11-jobs.md#limpezas-que-não-existem), [16 M11](16-pontos-de-atencao.md#médios) |
| 11 | Como as etapas de adoção (`adoption_steps`) são inseridas | [2](02-como-rodar.md#seeds), [16 B2](16-pontos-de-atencao.md#baixos) |
| 12 | Data padrão de entrada do animal calculada em UTC | [animais](04-endpoints/animais.md), [16 B5](16-pontos-de-atencao.md#baixos) |
| 13 | Fuso usado no mês da série de doações | [doações](04-endpoints/doacoes.md), [16 B6](16-pontos-de-atencao.md#baixos) |
| 14 | Adoções do painel contadas pelo `atualizado_em` do pedido | [dashboard](04-endpoints/dashboard.md), [16 B1](16-pontos-de-atencao.md#baixos) |
| 15 | Token de acesso sem `sid` pula a verificação de sessão | [7](07-autenticacao-autorizacao.md#validação-do-token-em-cada-requisição-requireauth-srcmiddlewareauthjs), [16 B7](16-pontos-de-atencao.md#baixos) |
| 16 | Se é intencional o log de erro não guardar mensagem nem pilha | [12](12-logs.md#logger-srcutilsloggerjs), [16 M8](16-pontos-de-atencao.md#médios) |
| 17 | Se a hospedagem coleta os logs e alerta sobre eventos `error` | [12](12-logs.md#monitoramento) |
| 18 | Se login, exportação de animais, pedido público e doação online deveriam ser auditados | [12](12-logs.md#ações-auditadas-30) |
| 19 | Se há meta de cobertura de testes | [14](14-testes.md#ferramentas) |
| 20 | `docs/migrations-plan.md` fala em "8 tabelas" na 000 (são 9) | [5](05-banco-de-dados.md#aplicadas-migrationsordemjson) |
| 21 | Funções sem uso em produção: `listAll`, `listPublic`, `isAvailable` | [6](06-services.md), [16 D4](16-pontos-de-atencao.md#manutenção) |

### ⚠️ inferido, confirmar (6)

| # | Ponto | Onde |
| --- | --- | --- |
| 1 | RN14 — o pedido pelo site não muda o status do animal (é regra ou lacuna?) | [requisitos](engenharia/requisitos.md#3-regras-de-negócio), [16 B3](16-pontos-de-atencao.md#baixos) |
| 2 | RNF20 — a API foi pensada para uma instância só | [requisitos](engenharia/requisitos.md#2-requisitos-não-funcionais) |
| 3 | DA01 — motivo de usar SQL puro sem ORM | [arquitetura](engenharia/arquitetura.md#6-decisões-arquiteturais) |
| 4 | DA02 — motivo dos services por fábrica com injeção | [arquitetura](engenharia/arquitetura.md#6-decisões-arquiteturais) |
| 5 | DA05 — motivo do contrato com códigos de erro estáveis | [arquitetura](engenharia/arquitetura.md#6-decisões-arquiteturais) |
| 6 | DA09 — fotos no disco local como decisão (e não provisório) | [arquitetura](engenharia/arquitetura.md#6-decisões-arquiteturais) |

## Manutenção desta documentação

Ao mudar o código, atualize junto: o documento do endpoint (seção 4) e o `docs/openapi.yaml` (o teste falha se uma
rota faltar); a seção 9 para novos códigos de erro; a seção 5 **e** a cópia do dicionário em
`engenharia/modelo-er.md` (o trecho original fica entre `<!-- dicionario:inicio -->` e `<!-- dicionario:fim -->`);
`npm run docs:permissoes` e a seção 7 para mudanças de permissão.
