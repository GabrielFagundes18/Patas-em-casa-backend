# 1. Visão geral

## O que o sistema faz

A API Patas em Casa atende dois públicos da ONG Patas em Casa:

- **Site público** (sem login): lista os animais disponíveis para adoção e o perfil de cada um, mostra histórias de
  adoção publicadas, as etapas do processo de adoção e números agregados; recebe pedidos de adoção, inscrições de
  voluntários e doações online pelo Mercado Pago (única ou mensal), incluindo o cancelamento da doação mensal por link.
- **Painel administrativo** (com login e permissões por cargo): cadastro de animais (com galeria de fotos e máquina de
  estados), triagem dos pedidos de adoção (quadro, responsável, agenda de visitas e entrevistas com verificação de
  conflito, aprovação/reprovação, termo assinado, e-mails ao adotante), adotantes (dados mascarados, revelação
  auditada, exportação e direitos do titular pela LGPD), doações (registro manual, resumo, série mensal, exportação e
  assinaturas mensais), voluntários, histórias, equipe e acessos, e um painel de indicadores.

## Principais regras de negócio

As regras completas, com código e local de implementação, estão em [engenharia/requisitos.md](engenharia/requisitos.md#3-regras-de-negócio).
Resumo:

| Tema | Regra |
| --- | --- |
| Animais | Só animais `disponivel` ou `urgente` aparecem no site. Mudanças de status seguem uma máquina de estados; `adotado` fora do fluxo de pedidos e a devolução (`adotado → disponivel`) são exclusivas do administrador; inativar e devolver exigem motivo. |
| Animais | Animal com pedido de adoção vinculado não pode ser excluído. Até 12 fotos por animal; a foto principal define o `foto_url`. |
| Pedido de adoção | Só para animal `disponivel`/`urgente`; um pedido em aberto por e-mail e animal; o adotante é criado pelo e-mail, sem sobrescrever um cadastro existente. O pedido pelo site **não** muda o status do animal. |
| Triagem | Aprovar marca o animal como `adotado`, o adotante como `adotante` e reprova automaticamente os outros pedidos abertos do animal. Reprovar o último pedido aberto de um animal `em_processo` devolve o animal para `disponivel`. Pedido decidido só aceita anotações. |
| Agenda | Visitas e entrevistas só no futuro e só em pedidos abertos; o mesmo responsável não pode ter compromissos sobrepostos. Visita move o pedido para `visita_agendada`. |
| E-mails | O e-mail ao adotante é sempre enviado depois de gravar a ação; falha no envio não desfaz a ação e fica anotada no histórico. A justificativa da decisão é interna. |
| LGPD | Contatos de adotantes saem mascarados; revelar exige permissão e gera auditoria. Anonimizar/excluir titular exige confirmação digitada e nenhum pedido em andamento. |
| Doações | Doação cancelada não pode ser alterada; doação online só muda pelo Mercado Pago (webhooks). Valores online entre R$ 5 e R$ 10.000. |
| Equipe | Ninguém altera o próprio cargo nem desativa a própria conta; sempre deve haver um administrador ativo; desativar ou redefinir senha encerra as sessões. |
| Acesso | Senha forte (10+ caracteres, letras e números); bloqueio de login após 5 falhas; sessão expira por inatividade (30 min) e por tempo total (12 h). |

## Stack

| Camada | Tecnologia | Versão (package.json / Dockerfile) | Para que serve |
| --- | --- | --- | --- |
| Linguagem | JavaScript (CommonJS) em Node.js | `engines.node >= 20`; imagem Docker `node:24-alpine` | Execução da API |
| Framework HTTP | Express | `^4.21.2` | Rotas, middlewares e respostas JSON |
| Banco de dados | PostgreSQL (Neon) | ⚠️ A confirmar (README cita "PostgreSQL 14+"; o CI usa `postgres:16`) | Persistência; SQL puro, sem ORM |
| Driver do banco | `pg` | `^8.17.0` | Pool de conexões e consultas parametrizadas |
| Autenticação | `jsonwebtoken` | `^9.0.2` | Token de acesso (JWT) e token de renovação |
| Senhas | `bcryptjs` | `^3.0.0` | Hash de senhas (12 rodadas) |
| CORS | `cors` | `^2.8.5` | Libera só as origens do site configuradas |
| Configuração | `dotenv` | `^16.4.5` | Lê o arquivo `.env` |
| Upload | `multer` | `^2.4.0` | Recebe as fotos (multipart) em memória |
| E-mail | `nodemailer` | `^10.0.15` | Envio por SMTP |
| Pagamentos | API REST do Mercado Pago (via `fetch` nativo) | — | Checkout Pro, assinaturas e consultas dos webhooks |
| Testes | `node:test` (nativo) | Node 20+ | Testes unitários, HTTP e de integração |

Não há ORM, fila, cache externo, linter nem framework de testes de terceiros no back-end.
