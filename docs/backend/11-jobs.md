# 11. Jobs e tarefas em segundo plano

**Não existem jobs agendados, filas nem workers.** O repositório não usa cron, `setInterval`, bibliotecas de fila
(Bull, Agenda etc.) nem processos separados: `server.js` sobe só o servidor HTTP.

O que acontece fora do ciclo normal de requisição/resposta:

| O quê | Como | Onde |
| --- | --- | --- |
| E-mail de "esqueci a senha" | Promessa disparada **sem `await`**: a resposta 202 sai antes do envio, para o tempo de resposta não revelar se o e-mail existe. Falhas vão para o log (`email_redefinicao_nao_enviado`, `email_redefinicao_falhou`) | `auth-service.requestPasswordReset` |
| Sincronização de pagamentos | Disparada **de fora**, pelos webhooks do Mercado Pago (não há verificação periódica) | `online-donation-service.handleWebhook` |
| Reprovação automática dos outros pedidos | Na mesma transação da aprovação: os demais pedidos em aberto do animal são reprovados (`reprovar_automaticamente`) | `adoption-triage-service.approve` |
| Anotação do resultado do e-mail no histórico | Depois da resposta do SMTP, numa transação separada da ação | `adoption-triage-service.notifyAdopter` |
| Encerramento gracioso | `SIGTERM`/`SIGINT`: para de aceitar conexões, força o fechamento das abertas após 5 s, fecha o pool e sai à força após 8 s | `server.js` |

## Estado em memória (por processo)

Não é job, mas é estado que vive só na memória da instância e se perde ao reiniciar:

| Estado | Validade / limpeza | Onde |
| --- | --- | --- |
| Contadores de rate limit (um `Map` por instância do middleware) | Janela fixa; as vencidas são apagadas uma vez por janela, na chegada de uma requisição | `middleware/rate-limit.js` |
| Bloqueio de login por conta | 5 falhas → 15 min, dobrando até 4 h; limpeza das entradas vencidas quando passa de 10.000 contas | `modules/auth/login-throttle.js` |
| Cache do resumo do painel | 15 s; `?atualizar=true` ignora o cache | `modules/dashboard/dashboard-service.js` |
| Disponibilidade da tabela de auditoria | Depois de encontrada, fica em cache; enquanto não existe, reconsulta a cada 60 s | `modules/audit/audit-repository.js` |

Com mais de uma instância da API, cada uma tem seus próprios contadores, bloqueios e cache.

## Limpezas que não existem

Nenhum processo apaga registros antigos de `sessoes` (revogadas ou expiradas), `tokens_redefinicao_acesso` (usados ou
expirados) ou `gateway_webhook_eventos`. As tabelas crescem indefinidamente. ⚠️ A confirmar: se há limpeza manual ou
agendada fora do repositório (ver [16](16-pontos-de-atencao.md)).
