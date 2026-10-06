# Plano de migrations aditivas

## Estado

Os arquivos abaixo sao propostas para revisao. Nenhum foi aplicado. O banco nao deve ser alterado ate aprovacao explicita.

## Ordem proposta

| Arquivo | Escopo | Impacto principal | Reversao |
| --- | --- | --- | --- |
| `000-patas-em-casa-schema.sql` | Schema atual (8 tabelas, 2 views, função e gatilhos de `atualizado_em`) | **Já aplicado** no Neon; serve para criar bancos novos (CI, branches de teste) | `rollback/000-patas-em-casa-schema.sql` apaga tudo (somente bancos descartáveis) |
| `001-seguranca-acesso.sql` | Tentativas, TOTP, desafios, sessoes, refresh, redefinicao e auditoria imutavel | Cria tabelas auxiliares e indices; nao altera `usuarios` | `rollback/001-seguranca-acesso.sql` remove as estruturas e os eventos gravados |
| `002-animais-prontuario.sql` | Perfil, midias, historico, vacinas, procedimentos e medicacoes | Adiciona colunas a `animais` e tabelas veterinarias | `rollback/002-animais-prontuario.sql` elimina perfil, prontuario e midias |
| `003-adotantes-lgpd.sql` | CPF cifrado/hash, respostas, consentimentos e solicitacoes do titular | Adiciona campos a `adotantes` e tabelas LGPD | `rollback/003-adotantes-lgpd.sql` elimina dados cifrados, hashes e historico LGPD |
| `004-adocoes-lares-temporarios.sql` | Protocolo, agenda, documentos, pos-adocao e vinculos de lar temporario | Adiciona campos a `pedidos_adocao` e tabelas auxiliares | `rollback/004-adocoes-lares-temporarios.sql` elimina agenda, termos e historico de lares |
| `005-financeiro-apadrinhamento.sql` | Apadrinhamentos, cobrancas, prestacao de contas, necessidades e webhooks | Cria tabelas financeiras auxiliares; eventos externos cifrados | `rollback/005-financeiro-apadrinhamento.sql` elimina conciliacao e lancamentos |
| `006-voluntarios-eventos.sql` | Disponibilidade, habilidades, triagem, eventos e escalas | Adiciona campos a `voluntarios` e cria tabelas de eventos | `rollback/006-voluntarios-eventos.sql` elimina eventos e os campos operacionais |
| `007-configuracoes-conteudo.sql` | Dados da ONG, gateway cifrado, conteudo versionado e manutencao | Cria tabelas administrativas de configuracao | `rollback/007-configuracoes-conteudo.sql` elimina configuracoes e historico |
| `008-jobs-relatorios-indices.sql` | Execucao idempotente de jobs, alertas, exports e indices adicionais | Cria tabelas operacionais e indices de leitura | `rollback/008-jobs-relatorios-indices.sql` elimina jobs, alertas, exports e indices |

## Pre-condicoes e riscos

- `001` usa `gen_random_uuid()` e pressupoe `pgcrypto` instalado pelo schema-base.
- `002` **nao modifica constraints existentes de `animais.status`**. Antes de habilitar os valores `em_tratamento` e `lar_temporario`, e necessario inspecionar a constraint real e propor uma migration aditiva propria. O catalogo auxiliar desta proposta nao altera o conjunto aceito pelo banco.
- `003` deixa CPF cifrado, nonce, tag e versao de chave em colunas separadas; a chave de aplicacao nunca fica no banco. `cpf_hash_busca` deve ser HMAC com chave distinta e rotacionavel, nao hash simples.
- `004` preserva as FKs existentes e nao altera a regra de transicao do animal durante a solicitacao.
- Todas as FKs de `usuarios` novas usam `SET NULL` ou nao mantem FK em auditoria para preservar o historico; a implementacao deve registrar o cargo como snapshot quando apropriado.
- Os rollbacks sao destrutivos para os dados criados por suas migrations. Devem ser usados somente apos backup/branch Neon e verificacao de impacto.
- Nenhum arquivo deste plano executa SQL automaticamente. Aplicacao deve usar `DATABASE_URL_DIRECT`, apos schema/seed validado e aprovacao.

## Procedimento de aplicacao (futuro)

1. Criar branch Neon derivada do ambiente alvo e registrar o ponto de restauracao.
2. Confirmar o schema real, principalmente constraints de status e nomes/nullable de colunas.
3. Aplicar uma migration por vez na ordem, verificar tabelas/indices e executar os testes de integracao correspondentes.
4. Promover para producao somente apos aprovacao explicita e plano de rollback testado na branch.

## Pendências que dependem de decisão

- **Cargo `atendimento`** e **status de animal `em_tratamento` / `lar_temporario`**: exigem recriar as restrições
  `usuarios_cargo_check` e `animais_status_check` mantendo todos os valores atuais (migração 009, a criar após aprovação).
  Enquanto isso, a API usa os cargos e status atuais; `financeiro` cumpre o papel de Atendimento e Doações.
- **Pedido de adoção pelo site**: hoje não muda o status do animal (premissa). Se o animal deve ir para `em_processo`
  ao receber o primeiro pedido, a regra entra em `src/services/adoptions/adoption-request-service.js`.
- **Auditoria**: o código já grava em `auditoria_eventos` assim que a 001 for aplicada (detectado automaticamente).
