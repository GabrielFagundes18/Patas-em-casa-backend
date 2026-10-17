/*
 * ============================================================================
 * ARQUIVO: health-routes.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define as ROTAS de saúde da API (sem login): "/", "/health" e "/ready".
 *
 * PRINCIPAIS ITENS:
 *   - router: roteador do Express (exportado).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./health-controller (as funções que respondem).
 *   - Montado em src/app.js no prefixo "/".
 * ============================================================================
 */

// Express (para criar o roteador).
const express = require('express');
// Controller com as respostas.
const ControllerHealth = require('./health-controller');

// express.Router() cria um "mini-app" só com rotas, montado depois com app.use().
const router = express.Router();

// router.get(caminho, função): responde a requisições GET nesse caminho.
// Informações da API.
router.get('/', ControllerHealth.getApiInfo);
// Processo vivo.
router.get('/health', ControllerHealth.checkHealth);
// Pronto (com banco).
router.get('/ready', ControllerHealth.checkReadiness);

// Exporta o roteador.
module.exports = router;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada GET é ligado a uma função do controller. O app.js monta este roteador
 *   na raiz, então as URLs finais são /, /health e /ready.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - express.Router e organização de rotas por módulo.
 *   - Separação entre rotas (caminhos) e controllers (respostas).
 * ============================================================================
 */
