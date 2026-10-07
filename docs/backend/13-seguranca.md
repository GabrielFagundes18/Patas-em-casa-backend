# 13. Segurança

Resumo do que o código faz hoje, por tema. Riscos e lacunas estão em [16. Pontos de atenção](16-pontos-de-atencao.md).

## Autenticação e sessão

Detalhes em [7. Autenticação e autorização](07-autenticacao-autorizacao.md).

| Controle | Implementação |
| --- | --- |
| Senhas | bcrypt, 12 rodadas; política de 10+ caracteres com letra e número, até 72 bytes |
| Token de acesso | JWT de 15 min no cabeçalho `Authorization`; cargo e situação relidos do banco a cada requisição |
| Renovação | Cookie `patas_refresh` `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` em produção; gira a cada uso; limite ocioso de 30 min e absoluto de 12 h |
| Revogação | Tabela `sessoes`; logout, troca/redefinição de senha e desativação derrubam sessões na hora |
| Força bruta | 20 logins/15 min por IP; bloqueio por conta após 5 falhas (15 min, dobrando até 4 h) |
| Enumeração de contas | Mesma resposta e comparação com hash fictício para e-mail inexistente; "esqueci a senha" sempre 202 com envio em segundo plano |
| Links por e-mail | Token aleatório de 32 bytes; só o hash SHA-256 no banco; uso único; novo link invalida os anteriores; 1 h (redefinição), 72 h (convite), 7 dias (cancelar doação mensal) |

## Segredos e configuração (`src/config/env.js`)

- Em **produção** a API não sobe sem: `DATABASE_URL`; `JWT_SECRET` com 32+ caracteres; `REFRESH_TOKEN_SECRET` com 32+
  caracteres e diferente do `JWT_SECRET`; `CORS_ORIGIN` com origens válidas (`http`/`https`, sem caminho);
  `API_PUBLIC_URL`. Também não sobe com `MERCADOPAGO_ACCESS_TOKEN` sem `MERCADOPAGO_WEBHOOK_SECRET`, nem com
  `SMTP_HOST` sem remetente.
- Em desenvolvimento/teste, segredos ausentes viram valores aleatórios por processo (as sessões caem ao reiniciar).
- `.env` fica fora do Git (`.gitignore`); `.env.example` só tem marcadores.
- ⚠️ **A senha do banco Neon já foi commitada no histórico do Git** e o repositório está público. Ela precisa ser
  trocada no Neon e o histórico precisa ser limpo (ver [16](16-pontos-de-atencao.md#críticos)).

## Autorização

- Matriz única cargo × módulo × ação em `src/config/permissions.js`; toda rota protegida declara
  `requirePermission('modulo:acao')`. Os testes de `tests/unit/http-permissions.test.js` conferem que cada cargo só
  alcança os módulos da sua matriz e que os módulos protegidos exigem sessão.
- Regras extras no service (transições de status só para administrador, autoalteração de cargo bloqueada, último
  administrador ativo, responsável precisa ter `adoptions:update`).

## Entrada de dados

| Ameaça | Controle |
| --- | --- |
| SQL injection | Todas as consultas usam parâmetros (`$1`, `$2`…) do `pg`; campos de ordenação vêm de listas fechadas no validador e no repository; colunas de `UPDATE` vêm de listas de campos editáveis |
| Dados malformados | Validadores por rota (tipo, tamanho, formato, enum), `CHECK`/`NOT NULL`/FK no banco |
| Corpo grande | JSON até 1 MB; fotos até 10 × 5 MB por requisição |
| Upload malicioso | Tipo detectado pelos primeiros bytes (JPEG/PNG/WebP), nome UUID, gravação sem sobrescrever, remoção com `basename`; pasta servida com `dotfiles: 'deny'` e sem índice |
| Injeção em planilhas (CSV) | Células iniciadas por `=`, `+`, `-`, `@`, tab ou retorno recebem apóstrofo; limite de 10.000 linhas |
| HTML em e-mails | Todo valor é escapado no HTML (`escapeHtml`) |
| Robôs nos formulários públicos | Campo-armadilha escondido `website`: se vier preenchido, o envio é recusado (422) — pedido de adoção, inscrição de voluntário e doação online |
| Webhook falso | HMAC-SHA256 do Mercado Pago com comparação em tempo constante; o estado é sempre consultado na API do MP, nunca lido do corpo |

## Cabeçalhos HTTP e navegador

- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'`,
  `Cross-Origin-Resource-Policy: same-site` (`cross-origin` só em `/uploads`), `Cache-Control: no-store` em `/api/*`,
  HSTS de 1 ano quando a requisição chega por HTTPS. `X-Powered-By` desligado.
- CORS só para as origens de `CORS_ORIGIN`, com credenciais.
- CSRF: `SameSite=Strict` no cookie + cabeçalho obrigatório `X-Requested-With: XMLHttpRequest` nas rotas que leem o
  cookie (`/auth/refresh`, `/auth/logout`). As demais rotas autenticam por cabeçalho `Authorization`, que o navegador
  não envia sozinho.
- `TRUST_PROXY` precisa estar certo atrás de proxy; senão `req.ip` (rate limit, auditoria) e `req.secure` (HSTS)
  ficam errados.

## Disponibilidade

- Limite global de 1000 requisições/5 min por IP em `/api/v1`; 10 envios/hora por IP nos formulários públicos;
  10/15 min em "esqueci a senha"/redefinição.
- `requestTimeout` do servidor (`REQUEST_TIMEOUT_MS`, padrão 30 s) e `headersTimeout` 5 s acima; timeout de 10 s nas
  chamadas ao banco, ao Mercado Pago e na conexão SMTP.
- Encerramento gracioso com limite de 8 s.

## Privacidade (LGPD)

| Controle | Onde |
| --- | --- |
| Contatos mascarados por padrão (`ma***@dominio`, `*******1234`), inclusive dentro de textos livres | `utils/masking.js`; listas e detalhes de adotantes e pedidos |
| Revelar contato exige `adopters:reveal` e é auditado | `POST /adopters/:id/reveal`, `POST /adoption-requests/:id/reveal` |
| Exportação de adotantes mascarada, salvo para quem tem `adopters:reveal` (ação auditada separadamente) | `adopter-controller.exportCsv` |
| Direitos do titular: exportar dados, anonimizar, excluir — só administrador (`lgpd:approve`); anonimizar e excluir exigem digitar `ANONIMIZAR`/`EXCLUIR` em `confirmacao` | `GET /adopters/:id/lgpd-export`, `POST /adopters/:id/anonymize`, `DELETE /adopters/:id` |
| Logs sem dados pessoais (lista fechada de campos) | `utils/logger.js` |
| Status público de doação não expõe dados pessoais | `GET /public/donations/status/:ref` |
| Perfil público de animal adotado/em processo responde 410 sem dados do adotante | `animal-service.getPublicById` |

⚠️ A confirmar: e-mails aparecem **sem máscara** nas listas de voluntários e de assinaturas mensais (ver
[16](16-pontos-de-atencao.md)).

⚠️ A confirmar: os formulários públicos não têm campo de consentimento LGPD explícito. O pedido de adoção exige só as
confirmações `ambiente_seguro` e `ciente_pos_adocao` (`true`); se o aceite fica só na interface do site, ele não é
registrado no banco.

## Dependências e pipeline

- CI roda `npm audit --omit=dev --audit-level=high` (falha com vulnerabilidade alta ou crítica nas dependências de
  produção).
- Imagem Docker com usuário `node` (sem root).
