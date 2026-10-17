-- ============================================================================
-- ARQUIVO: rollback/009-perfil-gestor-ong.sql
-- ============================================================================
--
-- PARA QUE SERVE:
--   ROLLBACK da migration 009, que criou o cargo "gestor_ong". Recria a
--   restrição CHECK da coluna usuarios.cargo SEM esse cargo.
--
-- PRINCIPAIS COMANDOS:
--   - ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT ... CHECK.
--
-- CONEXÕES COM OUTROS ARQUIVOS:
--   - Desfaz migrations/009-perfil-gestor-ong.sql (que está aplicada; por isso o
--     arquivo da 009 em si não recebeu comentários).
--   - Lista de cargos usada pela API: src/config/domain-values.js e permissions.js.
-- ============================================================================

-- Reversão da 009. Falha de propósito se ainda houver usuários com o cargo gestor_ong:
-- troque o cargo deles antes de executar.

-- Remove a restrição atual (que aceita gestor_ong).
ALTER TABLE usuarios DROP CONSTRAINT usuarios_cargo_check;
-- Recria a restrição só com os quatro cargos antigos. Se algum usuário ainda for gestor_ong,
-- o banco recusa este comando (a linha existente violaria a regra).
ALTER TABLE usuarios ADD CONSTRAINT usuarios_cargo_check
  CHECK (cargo IN ('administrador', 'gestor_animais', 'financeiro', 'voluntariado'));

-- ============================================================================
-- RESUMO DO ARQUIVO
-- ============================================================================
--
-- COMO O FLUXO FUNCIONA:
--   Troca a restrição CHECK de cargo pela versão anterior; só funciona se nenhum
--   usuário tiver o cargo removido.
--
-- CONCEITOS IMPORTANTES PARA ESTUDAR:
--   - Restrições CHECK e como alterá-las (DROP + ADD).
--   - Reversões que falham "de propósito" para proteger os dados.
-- ============================================================================
