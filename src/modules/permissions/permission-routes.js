/*
 * ============================================================================
 * ARQUIVO: permission-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define a rota GET /api/v1/permissions, que devolve a MATRIZ DE PERMISSÕES
 *   completa (módulos, ações e o que cada cargo pode). Só quem pode ver a equipe
 *   (permissão team:read) tem acesso.
 *
 * PRINCIPAIS ITENS:
 *   - router (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ../users/user-controller (permissionMatrix: a resposta).
 *   - ../../middleware/auth (requireAuth, requirePermission).
 *   - Montado em src/app.js no prefixo "/api/v1/permissions".
 * ============================================================================
 */

// Express.
const express = require('express');
// O controller de usuários tem a função que responde com a matriz.
const ControllerUsers = require('../users/user-controller');
// Middlewares de autenticação e autorização.
const { requireAuth, requirePermission } = require('../../middleware/auth');

// Roteador do módulo.
const router = express.Router();

// GET /api/v1/permissions: exige login (requireAuth) e a permissão team:read; depois responde.
// Os middlewares são executados na ordem em que aparecem.
router.get('/', requireAuth, requirePermission('team:read'), ControllerUsers.permissionMatrix);

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Requisição → requireAuth (quem é?) → requirePermission('team:read') (pode?) →
 *   ControllerUsers.permissionMatrix (responde com a matriz).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Encadear vários middlewares numa mesma rota.
 *   - Proteger rotas com autenticação + autorização.
 * ============================================================================
 */
