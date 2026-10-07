# 9. Validações e tratamento de erros

## Como as validações são feitas

Em três níveis, sem biblioteca de validação:

1. **Validadores de rota** (`src/modules/*/…-validator(s).js`): funções puras `({ body, params, query }) → details[]`,
   executadas pelo middleware `validateRequest` antes do controller. Conferem tipo, tamanho, formato e valores
   permitidos. Ajudantes comuns em `src/utils/validators.js`:

   | Ajudante | Regra |
   | --- | --- |
   | `UUID_PATTERN` | UUID versões 1–8, variante RFC |
   | `EMAIL_PATTERN` | `algo@algo.algo` sem espaços |
   | `PHONE_PATTERN` | Só dígitos, espaço, `(`, `)`, `+`, `-` (a contagem de dígitos é conferida em cada validador) |
   | `validateIdParam` | `:id` UUID |
   | `listQueryDetails(query, sortFields)` | Paginação válida; `q` até 120; `sort` na lista permitida; `order` `asc`/`desc` |
   | `textDetail(body, campo, { min, max, required, message })` | Texto com tamanho após `trim`; `null` é aceito quando o campo não é obrigatório |
   | `emailDetail`, `enumDetail`, `isValidDate` | E-mail até 150; valor numa lista; data `AAAA-MM-DD` real |

   Valores permitidos vêm de `src/config/domain-values.js`, espelho das restrições `CHECK` do banco.
2. **Regras de negócio nos services**: estado atual do registro (transições de status, pedido encerrado, conflito de
   agenda, última conta de administrador, data no futuro, política de senha etc.) → `AppError` com código próprio.
3. **Banco**: restrições `CHECK`, `NOT NULL`, `UNIQUE` e chaves estrangeiras. Os services traduzem `23505` (único) para
   409 `EMAIL_EM_USO` e `23503` (FK) para 409/422 conforme o caso (`ANIMAL_COM_PEDIDO`, `ADOTANTE_INVALIDO`,
   `VINCULO_INVALIDO`); outros erros do banco viram 500.

Campos desconhecidos no corpo são ignorados (cada service só usa sua lista de campos editáveis). Nas atualizações
parciais é preciso enviar ao menos um campo conhecido (senão 422 com `field: "body"`).

## Formato padrão de erro

```json
{ "error": { "code": "CODIGO_ESTAVEL", "message": "Mensagem em português para a pessoa.", "details": [ { "field": "campo", "message": "o que corrigir" } ] } }
```

`details` é sempre uma lista (vazia quando não há detalhe por campo). Erros não previstos respondem 500
`ERRO_INTERNO` sem detalhes internos; o log registra só `requestId`, método, status e código.

## Lista de códigos de erro

60 combinações de status e código lançadas pelo código (todas as chamadas `new AppError(...)` em `src/`, inclusive as
escritas em várias linhas), com 59 códigos distintos:

| Status | Código | Mensagem (exemplo) | Lançado em |
| --- | --- | --- | --- |
| 400 | `JSON_INVALIDO` | O corpo da requisição contém JSON inválido. | `middleware/error-handler.js` |
| 400 | `CORPO_MUITO_GRANDE` | O corpo da requisição excede o limite permitido. | `middleware/error-handler.js` |
| 400 | `PARAMETRO_INVALIDO` | O parâmetro page deve ser um inteiro positivo. | `utils/pagination.js` |
| 400 | `LINK_INVALIDO` | Este link é inválido ou já expirou. … | `auth-service`, `online-donation-service` |
| 401 | `NAO_AUTENTICADO` | Sessão expirada ou não autenticada. | `middleware/auth.js` |
| 401 | `TOKEN_INVALIDO` | Token inválido ou expirado. | `middleware/auth.js` |
| 401 | `SESSAO_INVALIDA` | Sessão expirada ou não autenticada. | `middleware/auth.js`, `auth-service` |
| 401 | `SESSAO_EXPIRADA` | Sua sessão expirou. Entre novamente. | `auth-service` |
| 401 | `CREDENCIAIS_INVALIDAS` | E-mail ou senha inválidos. | `auth-service` |
| 401 | `ASSINATURA_INVALIDA` | Notificação com assinatura inválida. | `online-donation-service` |
| 403 | `SEM_PERMISSAO` | Você não tem permissão para esta ação. | `middleware/auth.js` |
| 403 | `CSRF_INVALIDO` | Requisição recusada por segurança. … | `middleware/csrf.js` |
| 403 | `TRANSICAO_NAO_PERMITIDA` | Somente administradores podem … | `animal-status-rules` |
| 404 | `ROTA_NAO_ENCONTRADA` | A rota solicitada não foi encontrada. | `app.js` |
| 404 | `ANIMAL_NAO_ENCONTRADO` | Animal não encontrado. | `animal-service`, `adoption-request-service` |
| 404 | `FOTO_NAO_ENCONTRADA` | Foto não encontrada para este animal. | `animal-service` |
| 404 | `PEDIDO_NAO_ENCONTRADO` | Pedido de adoção não encontrado. | `adoption-triage-service` |
| 404 | `AGENDAMENTO_NAO_ENCONTRADO` | Agendamento não encontrado neste pedido. | `adoption-triage-service` |
| 404 | `ADOTANTE_NAO_ENCONTRADO` | Adotante não encontrado. | `adopter-service` |
| 404 | `DOACAO_NAO_ENCONTRADA` | Doação não encontrada. | `donation-service`, `online-donation-service` |
| 404 | `ASSINATURA_NAO_ENCONTRADA` | Doação mensal não encontrada. | `online-donation-service` |
| 404 | `HISTORIA_NAO_ENCONTRADA` | História não encontrada. | `story-service` |
| 404 | `USUARIO_NAO_ENCONTRADO` | Usuário não encontrado. | `user-service` |
| 404 | `VOLUNTARIO_NAO_ENCONTRADO` | Voluntário não encontrado. | `volunteer-service` |
| 409 | `EMAIL_EM_USO` | Já existe um … com este e-mail. | `adopter-service`, `user-service`, `volunteer-service` |
| 409 | `ANIMAL_INDISPONIVEL` | Este animal não está mais disponível para adoção. | `adoption-request-service` |
| 409 | `PEDIDO_EM_ANDAMENTO` | Já existe uma solicitação em andamento … | `adoption-request-service` |
| 409 | `PEDIDO_ENCERRADO` | Este pedido já foi decidido; só é possível adicionar anotações. | `adoption-triage-service` |
| 409 | `ANIMAL_JA_ADOTADO` | Este animal já foi adotado em outro pedido. | `adoption-triage-service` |
| 409 | `ANIMAL_INATIVO` | Este animal está inativo; reative-o antes de aprovar a adoção. | `adoption-triage-service` |
| 409 | `HORARIO_INDISPONIVEL` | <responsável> já tem visita com <adotante> em … | `adoption-triage-service` |
| 409 | `AGENDAMENTO_ENCERRADO` | Este agendamento já foi realizado ou cancelado. | `adoption-triage-service` |
| 409 | `PEDIDO_NAO_APROVADO` | O termo só pode ser marcado como assinado em pedidos aprovados. | `adoption-triage-service` |
| 409 | `TERMO_JA_ASSINADO` | O termo deste pedido já está marcado como assinado. | `adoption-triage-service` |
| 409 | `ANIMAL_COM_PEDIDO` | Não é possível excluir um animal com pedidos de adoção vinculados. | `animal-service` |
| 409 | `TRANSICAO_INVALIDA` | Não é possível mudar o status de "x" para "y". | `animal-status-rules` |
| 409 | `TITULAR_JA_ANONIMIZADO` | Os dados deste titular já foram anonimizados. | `adopter-service` |
| 409 | `PEDIDOS_EM_ANDAMENTO` | Encerre (aprove ou reprove) os pedidos em andamento … | `adopter-service` |
| 409 | `DOACAO_CANCELADA` | Doações canceladas não podem ser alteradas … | `donation-service` |
| 409 | `DOACAO_ONLINE` | Doações online são atualizadas automaticamente pelo Mercado Pago. | `donation-service` |
| 409 | `USUARIO_INATIVO` | Reative o usuário antes de enviar o convite. | `user-service` |
| 409 | `ALTERACAO_PROPRIA_BLOQUEADA` | Você não pode alterar o próprio cargo nem desativar a própria conta. | `user-service` |
| 409 | `ULTIMO_ADMINISTRADOR` | É preciso manter ao menos um administrador ativo. | `user-service` |
| 410 | `ANIMAL_INDISPONIVEL` | <nome> já encontrou um lar. / <nome> está em processo de adoção. (`details[0].message` = status) | `animal-service.getPublicById` |
| 422 | `VALIDACAO_INVALIDA` | Verifique os campos informados. | `middleware/validate-request.js`, `auth-service` |
| 422 | `ARQUIVO_INVALIDO` | Envie fotos em JPG, PNG ou WebP. | `middleware/upload.js`, `photo-storage`, `animal-service` |
| 422 | `LIMITE_DE_FOTOS` | Cada animal pode ter até 12 fotos. | `animal-service` |
| 422 | `MOTIVO_OBRIGATORIO` | Informe o motivo desta mudança de status. | `animal-status-rules` |
| 422 | `DATA_NO_PASSADO` | Escolha uma data futura … | `adoption-request-service`, `adoption-triage-service` |
| 422 | `RESPONSAVEL_INVALIDO` | Escolha um usuário ativo da equipe de adoções. | `adoption-triage-service` |
| 422 | `SENHA_FRACA` | A nova senha não atende à política de senha. | `auth-service`, `user-service` |
| 422 | `SENHA_ATUAL_INCORRETA` | A senha atual está incorreta. | `auth-service` |
| 422 | `ADOTANTE_INVALIDO` | O adotante informado não existe. | `donation-service` |
| 422 | `VINCULO_INVALIDO` | O animal ou adotante informado não existe. | `story-service` |
| 422 | `EXPORTACAO_MUITO_GRANDE` | A exportação tem N linhas; o limite é 10000. … | `utils/csv.js` |
| 429 | `MUITAS_REQUISICOES` | Muitas solicitações em pouco tempo. … | `middleware/rate-limit.js` |
| 429 | `LOGIN_BLOQUEADO` | Muitas tentativas sem sucesso. Tente novamente em N minuto(s). | `auth-service` |
| 500 | `ERRO_INTERNO` | Ocorreu um erro interno do servidor. | `middleware/error-handler.js` |
| 502 | `GATEWAY_INDISPONIVEL` | Não foi possível falar com o Mercado Pago agora. … | `mercado-pago-client` |
| 503 | `PAGAMENTO_INDISPONIVEL` | A doação online está temporariamente indisponível. … | `online-donation-service` |

O código `ANIMAL_INDISPONIVEL` aparece com **dois status**: 409 em `adoption-request-service` (pedido para animal
indisponível) e **410** em `animal-service.getPublicById` (perfil público de animal adotado ou em processo) — por isso
são 60 combinações e 59 códigos distintos.

Respostas fora do formato padrão: `GET /`, `/health` e `/ready` (corpo próprio, ver [saude.md](04-endpoints/saude.md))
e os CSV de exportação.
