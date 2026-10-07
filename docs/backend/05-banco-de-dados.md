# 5. Banco de dados

PostgreSQL (Neon em produção), acesso por SQL puro (`pg`), sem ORM. O schema real é o resultado das migrations
**aplicadas**: `000` + `009` a `013` (`migrations/ordem.json`; aplicadas no Neon em 06/10/2026 segundo
`docs/migrations-plan.md`), mais a tabela `schema_migrations`, criada pelo próprio `scripts/migrar.js`.

Resumo: **16 tabelas**, **2 views**, **1 função** e **4 gatilhos**. As migrations `001`–`008` são propostas (não
aplicadas) e estão descritas no fim desta página.

Convenções: chaves primárias `uuid` com `gen_random_uuid()` (extensão `pgcrypto`), exceto `adoption_steps` (`serial`),
`voluntario_areas` (chave composta) e `schema_migrations` (nome). Datas de controle em `timestamptz`. Valores fechados
por restrições `CHECK` (espelhadas em `src/config/domain-values.js`). `atualizado_em` é mantido pelo banco (gatilho);
a aplicação nunca escreve nele.

## Tabelas

<!-- dicionario:inicio -->

Legenda: **NN** = obrigatório (`NOT NULL`); PK = chave primária; FK = chave estrangeira; UQ = único.

### `usuarios` — membros da equipe do painel (migration 000; cargo ampliado na 009)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | Identificador |
| `nome` | varchar(150) | sim | | | Nome completo |
| `email` | varchar(150) | sim | | UQ `usuarios_email_key` | Login (a API grava em minúsculas e busca por `LOWER(email)`) |
| `senha_hash` | varchar(255) | sim | | | Hash bcrypt (12 rodadas) |
| `cargo` | varchar(50) | sim | | CHECK `administrador`, `gestor_ong`, `gestor_animais`, `financeiro`, `voluntariado` | Define as permissões |
| `ativo` | boolean | sim | `true` | | Inativo não entra e perde as sessões |
| `criado_em` | timestamptz | sim | `now()` | | Cadastro |

### `sessoes` — sessões do painel (010)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | Vai nos tokens como `sid` |
| `usuario_id` | uuid | sim | | FK → `usuarios.id` `ON DELETE CASCADE` | Dono da sessão |
| `agente_usuario` | varchar(500) | não | | | Navegador (user-agent) no login |
| `criado_em` | timestamptz | sim | `now()` | | Login |
| `ultimo_uso_em` | timestamptz | sim | `now()` | | Última renovação |
| `expira_em` | timestamptz | sim | | | Login + `SESSION_MAX_HOURS` |
| `revogado_em` | timestamptz | não | | | Logout, troca de senha ou desativação |

Índice: `idx_sessoes_usuario_ativas (usuario_id) WHERE revogado_em IS NULL`.

### `tokens_redefinicao_acesso` — links de redefinição de senha e convite (010)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `usuario_id` | uuid | sim | | FK → `usuarios.id` `ON DELETE CASCADE` | |
| `token_hash` | bytea | sim | | UQ | SHA-256 do token (o token só existe no e-mail) |
| `finalidade` | varchar(20) | sim | | CHECK `redefinicao`, `convite` | Validade: 1 h e 72 h |
| `criado_em` | timestamptz | sim | `now()` | | |
| `expira_em` | timestamptz | sim | | | |
| `usado_em` | timestamptz | não | | | Preenchido no uso ou quando um novo link é gerado |

Índice: `idx_tokens_redefinicao_pendentes (usuario_id) WHERE usado_em IS NULL`.

### `animais` — animais sob cuidado da ONG (000; `temperamento` na 012)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `nome` | varchar(100) | sim | | | |
| `especie` | varchar(30) | sim | | CHECK `cachorro`, `gato`, `outro` | |
| `raca` | varchar(100) | não | | | |
| `sexo` | varchar(10) | não | | CHECK `macho`, `femea` | |
| `idade_anos` | numeric(4,1) | não | | | Idade estimada em anos (0–999,9) |
| `porte` | varchar(20) | não | | CHECK `pequeno`, `medio`, `grande` | |
| `status` | varchar(20) | sim | `'disponivel'` | CHECK `disponivel`, `em_processo`, `adotado`, `urgente`, `inativo` | Só `disponivel`/`urgente` aparecem no site |
| `descricao` | text | não | | | |
| `foto_url` | text | não | | | URL da foto principal |
| `data_entrada` | date | sim | `CURRENT_DATE` | | Chegada à ONG |
| `castrado` | boolean | sim | `false` | | |
| `vacinado` | boolean | sim | `false` | | |
| `criado_em` | timestamptz | sim | `now()` | | |
| `atualizado_em` | timestamptz | sim | `now()` | gatilho `trg_animais_atualizado` | |
| `temperamento` | text[] | sim | `'{}'` | | Traços (até 10 de 40 caracteres, regra da API) |

Índices: `idx_animais_especie (especie)`, `idx_animais_status (status)`.

### `animais_midias` — galeria de fotos (012)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `animal_id` | uuid | sim | | FK → `animais.id` `ON DELETE CASCADE` | |
| `objeto_chave` | varchar(200) | sim | | UQ | Nome do arquivo em `UPLOAD_DIR/animais/` (`<uuid>.<ext>`) |
| `mime_type` | varchar(50) | sim | | CHECK `image/jpeg`, `image/png`, `image/webp` | Detectado pelo conteúdo |
| `tamanho_bytes` | integer | sim | | CHECK > 0 | |
| `ordem` | integer | sim | `0` | CHECK ≥ 0 | A API usa `MAX(ordem)+1` |
| `principal` | boolean | sim | `false` | UQ parcial: 1 por animal | Define o `foto_url` |
| `criado_em` | timestamptz | sim | `now()` | | |

Índices: `idx_animais_midias_animal (animal_id, ordem)`; `uq_animais_midias_principal (animal_id) WHERE principal`.

### `adotantes` — interessados em adotar (000)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `nome` | varchar(150) | sim | | | |
| `email` | varchar(150) | sim | | UQ `adotantes_email_key` | Identifica o adotante nos pedidos do site |
| `telefone` | varchar(20) | não | | | Dado pessoal (mascarado na API) |
| `cidade` | varchar(100) | não | | | |
| `estado` | char(2) | não | | | UF |
| `endereco` | text | não | | | Dado pessoal (omitido na API) |
| `status` | varchar(20) | sim | `'em_analise'` | CHECK `em_analise`, `visita_agendada`, `adotante`, `inativo` | Atualizado pela triagem |
| `criado_em` | timestamptz | sim | `now()` | | |

Índice: `idx_adotantes_status (status)`.

### `pedidos_adocao` — pedidos de adoção (000; `visita_preferida_em` na 011)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | Protocolo = `PAC-` + 8 primeiros caracteres |
| `animal_id` | uuid | sim | | FK → `animais.id` `ON DELETE RESTRICT` | |
| `adotante_id` | uuid | sim | | FK → `adotantes.id` `ON DELETE CASCADE` | |
| `responsavel_id` | uuid | não | | FK → `usuarios.id` `ON DELETE SET NULL` | Membro responsável pela triagem |
| `status` | varchar(20) | sim | `'novo'` | CHECK `novo`, `em_analise`, `visita_agendada`, `aprovado`, `reprovado` | Abertos: os três primeiros |
| `prioridade` | varchar(10) | **não** | `'medio'` | CHECK `alto`, `medio`, `baixo` | |
| `observacoes` | text | não | | | Dados do formulário + histórico de anotações |
| `termo_assinado` | boolean | sim | `false` | | |
| `termo_assinado_em` | timestamptz | não | | | |
| `data_pedido` | timestamptz | sim | `now()` | | |
| `atualizado_em` | timestamptz | sim | `now()` | gatilho `trg_pedidos_atualizado` | Usado como data aproximada da aprovação no dashboard |
| `visita_preferida_em` | timestamptz | não | | | Sugestão do adotante |

Índices: `idx_pedidos_adotante (adotante_id)`, `idx_pedidos_animal (animal_id)`, `idx_pedidos_status (status)`.

### `pedidos_adocao_agendamentos` — visitas e entrevistas (011)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `pedido_id` | uuid | sim | | FK → `pedidos_adocao.id` `ON DELETE CASCADE` | |
| `tipo` | varchar(20) | sim | | CHECK `visita`, `entrevista` | |
| `status` | varchar(20) | sim | `'agendado'` | CHECK `agendado`, `realizado`, `cancelado` | |
| `previsto_em` | timestamptz | sim | | | Início |
| `duracao_minutos` | smallint | sim | `60` | CHECK 15–480 | |
| `local` | varchar(300) | não | | | Local ou link |
| `mensagem` | text | não | | | Mensagem ao adotante |
| `responsavel_id` | uuid | não | | FK → `usuarios.id` `ON DELETE SET NULL` | Base da verificação de conflito |
| `criado_em` | timestamptz | sim | `now()` | | |
| `atualizado_em` | timestamptz | sim | `now()` | gatilho `trg_agendamentos_atualizado` | |

Índices: `idx_agendamentos_pedido (pedido_id)`; `idx_agendamentos_ativos (previsto_em) WHERE status = 'agendado'`.

### `doacoes` — doações manuais e online (000; colunas de gateway e status `falhou` na 013)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | Referência pública da doação online |
| `adotante_id` | uuid | não | | FK → `adotantes.id` `ON DELETE SET NULL` | |
| `doador_nome` | varchar(150) | sim | | | |
| `doador_email` | varchar(150) | não | | | Mascarado nas listas |
| `tipo` | varchar(20) | sim | | CHECK `unica`, `recorrente` | |
| `valor` | numeric(10,2) | sim | | CHECK > 0 | |
| `metodo` | varchar(30) | não | | CHECK `pix`, `cartao`, `boleto`, `transferencia` | |
| `status` | varchar(20) | sim | `'confirmada'` | CHECK `pendente`, `confirmada`, `cancelada`, `falhou` | Online nasce `pendente` |
| `data` | timestamptz | sim | `now()` | | |
| `gateway` | varchar(30) | não | | | `mercado_pago` nas online (bloqueia edição manual) |
| `gateway_pagamento_id` | varchar(100) | não | | UQ parcial com `gateway` | Id do pagamento no MP |
| `gateway_status` | varchar(40) | não | | | Status cru do MP |
| `assinatura_id` | uuid | não | | FK → `assinaturas_doacao.id` `ON DELETE SET NULL` | Cobrança de doação mensal |

Índices: `idx_doacoes_data (data)`, `idx_doacoes_tipo (tipo)`,
`uq_doacoes_gateway_pagamento (gateway, gateway_pagamento_id) WHERE gateway_pagamento_id IS NOT NULL`.

### `assinaturas_doacao` — doações mensais (013)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | `external_reference` no MP |
| `doador_nome` | varchar(150) | sim | | | |
| `doador_email` | varchar(150) | sim | | | |
| `valor` | numeric(10,2) | sim | | CHECK > 0 | Valor mensal |
| `status` | varchar(20) | sim | `'pendente'` | CHECK `pendente`, `ativa`, `pausada`, `cancelada` | |
| `gateway` | varchar(30) | sim | `'mercado_pago'` | | |
| `gateway_assinatura_id` | varchar(100) | não | | UQ | Id da preapproval |
| `token_cancelamento_hash` | bytea | não | | UQ | SHA-256 do link de cancelamento |
| `token_cancelamento_expira_em` | timestamptz | não | | | 7 dias |
| `criado_em` | timestamptz | sim | `now()` | | |
| `atualizado_em` | timestamptz | sim | `now()` | gatilho `trg_assinaturas_doacao_atualizado` | |
| `cancelada_em` | timestamptz | não | | | |

Índice: `idx_assinaturas_doacao_email (lower(doador_email))`.

### `gateway_webhook_eventos` — notificações recebidas (013)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `provedor` | varchar(30) | sim | | UQ com `evento_externo_id` | `mercado_pago` |
| `evento_externo_id` | varchar(200) | sim | | | Id da notificação (idempotência) |
| `tipo` | varchar(60) | sim | | | `payment`, `subscription_preapproval`, … |
| `recurso_id` | varchar(100) | sim | | | Id do recurso no MP |
| `status` | varchar(20) | sim | `'recebido'` | CHECK `recebido`, `processado`, `falhou`, `ignorado` | |
| `codigo_erro` | varchar(80) | não | | | |
| `recebido_em` | timestamptz | sim | `now()` | | |
| `processado_em` | timestamptz | não | | | |

O corpo da notificação **não** é guardado.

### `historias` — histórias de adoção (000)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | |
| `animal_id` | uuid | não | | FK → `animais.id` `ON DELETE SET NULL` | |
| `adotante_id` | uuid | não | | FK → `adotantes.id` `ON DELETE SET NULL` | Nunca exposto no site |
| `autor_nome` | varchar(150) | sim | | | |
| `texto` | text | sim | | | 10–5000 (regra da API) |
| `foto_url` | text | não | | | |
| `publicado` | boolean | sim | `false` | | Só publicadas aparecem no site |
| `criado_em` | timestamptz | sim | `now()` | | |

### `voluntarios` — voluntários (000)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | uuid | sim | `gen_random_uuid()` | PK | Protocolo = `VOL-` + 8 primeiros caracteres |
| `nome` | varchar(150) | sim | | | |
| `email` | varchar(150) | sim | | UQ `voluntarios_email_key` | |
| `telefone` | varchar(20) | não | | | |
| `status` | varchar(20) | sim | `'ativo'` | CHECK `ativo`, `inativo` | Inscrição pelo site entra `inativo` |
| `data_inicio` | date | sim | `CURRENT_DATE` | | |
| `criado_em` | timestamptz | sim | `now()` | | |

### `voluntario_areas` — áreas de interesse do voluntário (000)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `voluntario_id` | uuid | sim (PK) | | PK composta; FK → `voluntarios.id` `ON DELETE CASCADE` | |
| `area` | varchar(50) | sim (PK) | | PK composta; CHECK `passeios`, `banho_e_tosa`, `divulgacao`, `eventos`, `transporte`, `fotografia`, `socializacao`, `captacao`, `manutencao` | |

### `adoption_steps` — etapas do processo de adoção exibidas no site (000)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `id` | serial | sim | sequência | PK | |
| `step_order` | integer | sim | | UQ `adoption_steps_step_order_key` | Ordem (sai como `ordem`) |
| `title` | varchar(100) | sim | | | Sai como `titulo` |
| `description` | text | sim | | | Sai como `descricao` |
| `is_active` | boolean | não | `true` | | `false` esconde do site |
| `created_at` | timestamp (sem fuso) | não | `CURRENT_TIMESTAMP` | | |

Única tabela com nomes em inglês e sem endpoint de escrita.

### `schema_migrations` — controle de migrations (criada por `scripts/migrar.js`)

| Campo | Tipo | NN | Padrão | Restrições | Descrição |
| --- | --- | :---: | --- | --- | --- |
| `nome` | varchar(200) | sim | | PK | Arquivo de `migrations/` |
| `checksum` | char(64) | sim | | | SHA-256 do arquivo aplicado |
| `aplicada_em` | timestamptz | sim | `now()` | | |

<!-- dicionario:fim -->

## Views, função e gatilhos

| Objeto | Definição | Usado por |
| --- | --- | --- |
| `vw_doacoes_por_mes` | `mes` (`date_trunc('month', data)`), `total` (soma) e `quantidade` das doações `confirmada`, por mês | `GET /donations/monthly`, dashboard |
| `vw_kpis_gerais` | `total_animais` (todos), `total_adocoes` (animais `adotado`), `pedidos_pendentes` (pedidos fora de `aprovado`/`reprovado`), `doacoes_mes_atual` (soma das `confirmada` do mês corrente) | dashboard, `/public/stats`, `/donations/summary` |
| `set_atualizado_em()` | Função `plpgsql` que grava `NEW.atualizado_em = now()` | gatilhos abaixo |
| `trg_animais_atualizado`, `trg_pedidos_atualizado`, `trg_agendamentos_atualizado`, `trg_assinaturas_doacao_atualizado` | `BEFORE UPDATE … FOR EACH ROW EXECUTE FUNCTION set_atualizado_em()` | `animais`, `pedidos_adocao`, `pedidos_adocao_agendamentos`, `assinaturas_doacao` |

## Relacionamentos

| De | Para | Cardinalidade | Ao apagar o "para" |
| --- | --- | --- | --- |
| `pedidos_adocao.animal_id` | `animais` | N:1 (obrigatório) | `RESTRICT` (animal com pedido não pode ser apagado) |
| `pedidos_adocao.adotante_id` | `adotantes` | N:1 (obrigatório) | `CASCADE` (apaga os pedidos) |
| `pedidos_adocao.responsavel_id` | `usuarios` | N:1 (opcional) | `SET NULL` |
| `pedidos_adocao_agendamentos.pedido_id` | `pedidos_adocao` | N:1 (obrigatório) | `CASCADE` |
| `pedidos_adocao_agendamentos.responsavel_id` | `usuarios` | N:1 (opcional) | `SET NULL` |
| `animais_midias.animal_id` | `animais` | N:1 (obrigatório) | `CASCADE` |
| `historias.animal_id` | `animais` | N:1 (opcional) | `SET NULL` |
| `historias.adotante_id` | `adotantes` | N:1 (opcional) | `SET NULL` |
| `doacoes.adotante_id` | `adotantes` | N:1 (opcional) | `SET NULL` |
| `doacoes.assinatura_id` | `assinaturas_doacao` | N:1 (opcional) | `SET NULL` |
| `voluntario_areas.voluntario_id` | `voluntarios` | N:1 (obrigatório) | `CASCADE` |
| `sessoes.usuario_id` | `usuarios` | N:1 (obrigatório) | `CASCADE` |
| `tokens_redefinicao_acesso.usuario_id` | `usuarios` | N:1 (obrigatório) | `CASCADE` |

Sem chave estrangeira: `gateway_webhook_eventos` (ligação lógica pelo `recurso_id` no Mercado Pago),
`adoption_steps` e `schema_migrations`. Diagrama ER em [engenharia/modelo-er.md](engenharia/modelo-er.md).

## Migrations

### Aplicadas (`migrations/ordem.json`)

| Arquivo | O que faz | Reversão |
| --- | --- | --- |
| `000-patas-em-casa-schema.sql` | Schema base: extensão `pgcrypto`; tabelas `adoption_steps`, `usuarios`, `animais`, `adotantes`, `pedidos_adocao`, `doacoes`, `historias`, `voluntarios`, `voluntario_areas`; 8 índices; FKs; função e gatilhos de `atualizado_em` (animais e pedidos); views `vw_doacoes_por_mes` e `vw_kpis_gerais` | `rollback/000-…` apaga tudo (só bancos descartáveis) |
| `009-perfil-gestor-ong.sql` | Recria `usuarios_cargo_check` incluindo `gestor_ong` | `rollback/009-…` (falha se houver usuários com o cargo) |
| `010-sessoes-e-redefinicao-senha.sql` | Tabelas `sessoes` e `tokens_redefinicao_acesso` + índices parciais | `rollback/010-…` (encerra todas as sessões) |
| `011-agenda-adocao.sql` | Coluna `pedidos_adocao.visita_preferida_em`; tabela `pedidos_adocao_agendamentos`, índices e gatilho | `rollback/011-…` |
| `012-fotos-temperamento-animais.sql` | Coluna `animais.temperamento text[]`; tabela `animais_midias`, índice e índice único parcial da principal | `rollback/012-…` (não apaga arquivos do disco) |
| `013-doacoes-mercado-pago.sql` | Status `falhou` em `doacoes`; tabela `assinaturas_doacao` (+ índice e gatilho); colunas `gateway`, `gateway_pagamento_id`, `gateway_status`, `assinatura_id` em `doacoes` (+ índice único parcial); tabela `gateway_webhook_eventos` | `rollback/013-…` |

⚠️ A confirmar: `docs/migrations-plan.md` descreve a 000 como "8 tabelas"; o arquivo cria 9 (contando `voluntario_areas`).

### Propostas, não aplicadas (fora de `ordem.json`)

Existem em `migrations/` com reversões em `migrations/rollback/`, mas **não fazem parte do banco** nem são usadas pelo
código — exceto `auditoria_eventos` (001), que a auditoria passa a usar automaticamente se a tabela existir
(ver [6. Services](06-services.md#audit-service-srcmodulesauditaudit-servicejs)).

| Arquivo | Tabelas novas | Colunas novas em tabelas existentes |
| --- | --- | --- |
| `001-seguranca-acesso.sql` | `tentativas_login`, `usuarios_totp`, `codigos_recuperacao_2fa`, `desafios_2fa`, `auditoria_eventos` (com gatilho de imutabilidade) | — |
| `002-animais-prontuario.sql` | `animais_status_historico`, `animais_vacinas`, `animais_procedimentos_veterinarios`, `animais_medicacoes`, `status_animal_adicionais_catalogo` | `animais`: `necessidades_especiais`, `historia_resgate` |
| `003-adotantes-lgpd.sql` | `pedidos_adocao_respostas`, `consentimentos_lgpd`, `solicitacoes_lgpd` | `adotantes`: `cpf_cifrado`, `cpf_nonce`, `cpf_tag_autenticacao`, `cpf_hash_busca`, `cpf_versao_chave`, `data_nascimento`, `dados_endereco`, `anonimizado_em` |
| `004-adocoes-lares-temporarios.sql` | `pedidos_adocao_documentos`, `pos_adocao_contatos`, `pos_adocao_midias`, `lares_temporarios`, `animais_lares_temporarios` | `pedidos_adocao`: `protocolo`, `justificativa_decisao` |
| `005-financeiro-apadrinhamento.sql` | `apadrinhamentos`, `apadrinhamentos_cobrancas`, `financeiro_lancamentos`, `necessidades_fisicas` | — |
| `006-voluntarios-eventos.sql` | `eventos`, `eventos_animais`, `eventos_voluntarios` | `voluntarios`: `disponibilidade`, `possui_veiculo`, `habilidades`, `status_triagem` |
| `007-configuracoes-conteudo.sql` | `configuracoes_ong`, `configuracoes_gateway`, `paginas_institucionais`, `paginas_institucionais_versoes`, `modo_manutencao` | — |
| `008-jobs-relatorios-indices.sql` | `execucoes_jobs`, `alertas_sistema`, `relatorios_exportacoes` (+ índices em `pedidos_adocao` e `doacoes`) | — |

Segundo `docs/migrations-plan.md`, partes dessas propostas (sessões, redefinição de senha, fotos, temperamento,
agenda e webhooks) foram reescritas e aplicadas pelas migrations 010–013; as propostas originais continuam como estavam.
