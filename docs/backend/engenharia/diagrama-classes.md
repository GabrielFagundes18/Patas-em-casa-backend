# Diagrama de classes

**Como ler.** O back-end é JavaScript (CommonJS) sem orientação a objetos: a única classe declarada é `AppError`.
Entidades são objetos simples vindos do banco, e services são criados por funções de fábrica
(`createXService(deps)`) que devolvem um objeto com funções. Os diagramas abaixo representam:

1. **Modelo de domínio** — as entidades persistidas como classes conceituais (atributos = colunas, relacionamentos =
   chaves estrangeiras), com os valores fechados como enumerações.
2. **Camada de aplicação** — cada service e repository como uma "classe" cujos métodos são as funções exportadas,
   com as dependências injetadas pela fábrica.

Tipos e restrições de cada atributo: [modelo-er.md](modelo-er.md) e [5. Banco de dados](../05-banco-de-dados.md).

## 1. Modelo de domínio

```mermaid
classDiagram
  direction LR

  class Usuario {
    uuid id
    string nome
    string email
    string senha_hash
    Cargo cargo
    boolean ativo
    datetime criado_em
  }
  class Sessao {
    uuid id
    string agente_usuario
    datetime criado_em
    datetime ultimo_uso_em
    datetime expira_em
    datetime revogado_em
  }
  class TokenRedefinicaoAcesso {
    uuid id
    bytes token_hash
    Finalidade finalidade
    datetime expira_em
    datetime usado_em
  }
  class Animal {
    uuid id
    string nome
    Especie especie
    string raca
    Sexo sexo
    decimal idade_anos
    Porte porte
    StatusAnimal status
    string descricao
    string foto_url
    date data_entrada
    boolean castrado
    boolean vacinado
    string[] temperamento
  }
  class AnimalMidia {
    uuid id
    string objeto_chave
    string mime_type
    int tamanho_bytes
    int ordem
    boolean principal
  }
  class Adotante {
    uuid id
    string nome
    string email
    string telefone
    string cidade
    string estado
    string endereco
    StatusAdotante status
  }
  class PedidoAdocao {
    uuid id
    StatusPedido status
    Prioridade prioridade
    string observacoes
    boolean termo_assinado
    datetime termo_assinado_em
    datetime data_pedido
    datetime visita_preferida_em
  }
  class Agendamento {
    uuid id
    TipoAgendamento tipo
    StatusAgendamento status
    datetime previsto_em
    int duracao_minutos
    string local
    string mensagem
  }
  class Doacao {
    uuid id
    string doador_nome
    string doador_email
    TipoDoacao tipo
    decimal valor
    MetodoDoacao metodo
    StatusDoacao status
    datetime data
    string gateway
    string gateway_pagamento_id
    string gateway_status
  }
  class AssinaturaDoacao {
    uuid id
    string doador_nome
    string doador_email
    decimal valor
    StatusAssinatura status
    string gateway_assinatura_id
    bytes token_cancelamento_hash
    datetime token_cancelamento_expira_em
    datetime cancelada_em
  }
  class EventoWebhook {
    uuid id
    string provedor
    string evento_externo_id
    string tipo
    string recurso_id
    StatusEvento status
    string codigo_erro
  }
  class Historia {
    uuid id
    string autor_nome
    string texto
    string foto_url
    boolean publicado
  }
  class Voluntario {
    uuid id
    string nome
    string email
    string telefone
    StatusVoluntario status
    date data_inicio
  }
  class AreaVoluntario {
    AreaInteresse area
  }
  class EtapaAdocao {
    int id
    int step_order
    string title
    string description
    boolean is_active
  }

  Usuario "1" -- "0..*" Sessao : abre
  Usuario "1" -- "0..*" TokenRedefinicaoAcesso : recebe
  Usuario "0..1" -- "0..*" PedidoAdocao : responsável
  Usuario "0..1" -- "0..*" Agendamento : responsável
  Animal "1" *-- "0..12" AnimalMidia : galeria
  Animal "1" -- "0..*" PedidoAdocao : pedido para
  Adotante "1" *-- "0..*" PedidoAdocao : faz
  PedidoAdocao "1" *-- "0..*" Agendamento : agenda
  Adotante "0..1" -- "0..*" Doacao : doador vinculado
  AssinaturaDoacao "0..1" -- "0..*" Doacao : cobrança mensal
  Animal "0..1" -- "0..*" Historia : sobre
  Adotante "0..1" -- "0..*" Historia : sobre
  Voluntario "1" *-- "0..*" AreaVoluntario : interesse
```

`*--` (composição) marca as FKs com `ON DELETE CASCADE` em que a parte não existe sem o todo; a ligação
`Animal — PedidoAdocao` é `RESTRICT`. `EventoWebhook` e `EtapaAdocao` não têm relacionamentos no banco. O limite
"0..12" fotos é regra da API (RN06), não do banco.

### Enumerações

```mermaid
classDiagram
  class Cargo {
    <<enumeration>>
    administrador
    gestor_ong
    gestor_animais
    financeiro
    voluntariado
  }
  class StatusAnimal {
    <<enumeration>>
    disponivel
    urgente
    em_processo
    adotado
    inativo
  }
  class StatusPedido {
    <<enumeration>>
    novo
    em_analise
    visita_agendada
    aprovado
    reprovado
  }
  class StatusAdotante {
    <<enumeration>>
    em_analise
    visita_agendada
    adotante
    inativo
  }
  class StatusAgendamento {
    <<enumeration>>
    agendado
    realizado
    cancelado
  }
  class TipoAgendamento {
    <<enumeration>>
    visita
    entrevista
  }
  class StatusDoacao {
    <<enumeration>>
    pendente
    confirmada
    cancelada
    falhou
  }
  class MetodoDoacao {
    <<enumeration>>
    pix
    cartao
    boleto
    transferencia
  }
  class TipoDoacao {
    <<enumeration>>
    unica
    recorrente
  }
  class StatusAssinatura {
    <<enumeration>>
    pendente
    ativa
    pausada
    cancelada
  }
  class StatusEvento {
    <<enumeration>>
    recebido
    processado
    falhou
    ignorado
  }
  class Prioridade {
    <<enumeration>>
    alto
    medio
    baixo
  }
  class Especie {
    <<enumeration>>
    cachorro
    gato
    outro
  }
  class Porte {
    <<enumeration>>
    pequeno
    medio
    grande
  }
  class Sexo {
    <<enumeration>>
    macho
    femea
  }
  class StatusVoluntario {
    <<enumeration>>
    ativo
    inativo
  }
  class Finalidade {
    <<enumeration>>
    redefinicao
    convite
  }
  class AreaInteresse {
    <<enumeration>>
    passeios
    banho_e_tosa
    divulgacao
    eventos
    transporte
    fotografia
    socializacao
    captacao
    manutencao
  }
```

### Máquinas de estado

```mermaid
stateDiagram-v2
  direction LR
  state "Animal" as A {
    [*] --> disponivel
    disponivel --> urgente
    disponivel --> em_processo
    disponivel --> inativo : motivo
    urgente --> disponivel
    urgente --> em_processo
    urgente --> inativo : motivo
    em_processo --> disponivel
    em_processo --> urgente
    em_processo --> adotado : aprovação do pedido ou administrador
    em_processo --> inativo : motivo
    adotado --> disponivel : administrador + motivo
    inativo --> disponivel
    inativo --> urgente
  }
```

A aprovação de um pedido leva o animal a `adotado` a partir de qualquer status, exceto `adotado` e `inativo`
(`ANIMAL_JA_ADOTADO`, `ANIMAL_INATIVO`); a reprovação do último pedido aberto devolve `em_processo` para `disponivel`.

```mermaid
stateDiagram-v2
  direction LR
  state "Pedido de adoção" as P {
    [*] --> novo : site
    novo --> em_analise : triagem ou entrevista
    novo --> visita_agendada : visita
    em_analise --> visita_agendada : visita
    visita_agendada --> em_analise : triagem ou cancelar a única visita
    em_analise --> novo : triagem
    visita_agendada --> novo : triagem
    novo --> aprovado
    em_analise --> aprovado
    visita_agendada --> aprovado
    novo --> reprovado
    em_analise --> reprovado
    visita_agendada --> reprovado : manual ou automática
    aprovado --> [*]
    reprovado --> [*]
  }
```

Entre os três status abertos a triagem pode mover livremente (`PATCH /adoption-requests/:id`); `aprovado` e
`reprovado` são finais (só aceitam anotações). Doação: `pendente → confirmada/falhou/cancelada` (manual ou webhook);
`cancelada` é final. Assinatura: `pendente ↔ ativa ↔ pausada → cancelada` conforme o Mercado Pago.

## 2. Camada de aplicação

```mermaid
classDiagram
  direction TB

  class AppError {
    +number status
    +string code
    +string message
    +Array details
    +constructor(status, code, message, details)
  }

  class AuthService {
    +login(credenciais, contexto)
    +refresh(refreshToken)
    +logout(refreshToken)
    +getCurrentUser(id)
    +changeOwnPassword(userId, payload, contexto)
    +requestPasswordReset(payload)
    +resetPassword(payload)
  }
  class AccessLinkService {
    +issue(user, finalidade)
    +send(user, finalidade)
    +consume(db, token)
  }
  class LoginThrottle {
    -Map accounts
    +check(email)
    +registerFailure(email)
    +registerSuccess(email)
  }
  class UserService {
    +list(query)
    +getById(id)
    +create(payload, actor)
    +sendInvite(id, actor)
    +update(id, payload, actor)
    +resetPassword(id, payload, actor)
  }
  class AuditService {
    +record(event, db)
    +auditContext(req)$
  }
  class AnimalService {
    +list(query)
    +listPublicPage(query)
    +getPublicById(id)
    +listForExport(query)
    +getById(id)
    +getDetail(id)
    +create(payload, actor)
    +update(id, payload, actor)
    +changeStatus(id, payload, actor)
    +remove(id, actor)
    +addPhotos(id, files, actor)
    +setPrincipalPhoto(id, photoId, actor)
    +removePhoto(id, photoId, actor)
    +listAll(filters)
    +listPublic()
  }
  class AnimalStatusRules {
    +assertStatusTransition(from, to, role, motivo)$
  }
  class AdoptionRequestService {
    +create(payload)
  }
  class AdoptionTriageService {
    +list(query)
    +board(opcoes)
    +getById(id)
    +reveal(id, actor)
    +update(id, payload, actor)
    +approve(id, payload, actor)
    +reject(id, payload, actor)
    +schedule(id, payload, actor)
    +reschedule(id, appointmentId, payload, actor)
    +cancelAppointment(id, appointmentId, payload, actor)
    +completeAppointment(id, appointmentId, actor)
    +markTermSigned(id, actor)
  }
  class AdopterService {
    +list(query)
    +getById(id)
    +reveal(id, actor)
    +update(id, payload, actor)
    +listForExport(query, opcoes, actor)
    +exportTitularData(id, actor)
    +anonymize(id, actor)
    +remove(id, actor)
  }
  class DonationService {
    +list(query)
    +getById(id)
    +create(payload, actor)
    +update(id, payload, actor)
    +summary(query)
    +monthly(query)
    +listForExport(query, actor)
  }
  class OnlineDonationService {
    +isAvailable()
    +startCheckout(payload)
    +getPublicStatus(ref)
    +handleWebhook(request)
    +requestCancelLink(payload)
    +cancelByToken(payload)
    +listSubscriptions(query)
    +cancelSubscriptionById(id, actor)
  }
  class DashboardService {
    -cache
    +summary(opcoes)
    +publicStats()
  }
  class StoryService {
    +list(query)
    +getById(id)
    +create(payload, actor)
    +update(id, payload, actor)
    +remove(id, actor)
    +listPublished(query)
  }
  class VolunteerService {
    +list(query)
    +getById(id)
    +create(payload, actor)
    +update(id, payload, actor)
    +remove(id, actor)
    +apply(payload)
  }
  class AdoptionStepService {
    +listActive()
  }

  class Mailer {
    +isConfigured()
    +send(mensagem)
  }
  class MercadoPagoClient {
    +createPreference(body)
    +getPayment(id)
    +createPreapproval(body)
    +getPreapproval(id)
    +cancelPreapproval(id)
    +getAuthorizedPayment(id)
  }
  class PhotoStorage {
    +string directory
    +save(buffer)
    +remove(key)
    +urlFor(key)
  }

  class Repositories {
    <<module>>
    user · session · access-link
    animal · animal-media
    adoption-request · adoption-triage · appointment
    adopter · donation · online-donation
    story · volunteer · dashboard
    adoption-step · audit
  }

  AuthService --> LoginThrottle
  AuthService --> AccessLinkService
  AuthService --> Repositories : user, session
  AccessLinkService --> Mailer
  AccessLinkService --> Repositories : access-link
  UserService --> AccessLinkService
  UserService --> AuditService
  UserService --> Repositories : user, session
  AnimalService --> AnimalStatusRules
  AnimalService --> PhotoStorage
  AnimalService --> AuditService
  AnimalService --> Repositories : animal, animal-media
  AdoptionRequestService --> Repositories : adoption-request
  AdoptionTriageService --> Mailer
  AdoptionTriageService --> AuditService
  AdoptionTriageService --> Repositories : adoption-triage, appointment
  AdopterService --> AuditService
  AdopterService --> Repositories : adopter
  DonationService --> AuditService
  DonationService --> Repositories : donation
  OnlineDonationService --> MercadoPagoClient
  OnlineDonationService --> Mailer
  OnlineDonationService --> AuditService
  OnlineDonationService --> Repositories : online-donation
  DashboardService --> Repositories : dashboard
  StoryService --> AuditService
  StoryService --> Repositories : story
  VolunteerService --> AuditService
  VolunteerService --> Repositories : volunteer
  AdoptionStepService --> Repositories : adoption-step
  AuditService --> Repositories : audit
  AuthService ..> AppError : lança
  AnimalStatusRules ..> AppError : lança
  MercadoPagoClient ..> AppError : lança
```

Os 12 controllers só traduzem HTTP ↔ service e não aparecem no diagrama (o router `permissions` usa o
`user-controller`, e o de webhooks, o `online-donation-controller`);
o mapeamento rota → controller → service está em [4. Endpoints](../04-endpoints/README.md). Todo service pode
lançar `AppError` (só três setas estão desenhadas). Repositories recebem um cliente `db` opcional para participar da
transação do chamador.
