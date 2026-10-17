/*
 * ============================================================================
 * ARQUIVO: adoption-step-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE dos PASSOS DA ADOÇÃO. Hoje só repassa a chamada ao repository, mas
 *   mantém o padrão das camadas (controller → service → repository): se um dia
 *   houver regra de negócio (ex.: esconder passos, traduzir), ela entra aqui.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - createAdoptionStepService(repository): cria o service com listActive (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./adoption-step-repository.
 *   - Usado por: modules/public/public-controller.js.
 * ============================================================================
 */

// Repository dos passos.
const adoptionStepRepository = require('./adoption-step-repository');

/*
 * FUNÇÃO: createAdoptionStepService (fábrica)
 * Parâmetros: repository (opcional) — os testes podem passar um falso.
 * Retorno: { listActive }.
 */
function createAdoptionStepService(repository = adoptionStepRepository) {
  // Lista os passos ativos (só delega ao repository).
  async function listActive() {
    return repository.listActive();
  }

  return { listActive };
}

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createAdoptionStepService(), createAdoptionStepService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   public-controller.listAdoptionSteps → service.listActive → repository.listActive.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Arquitetura em camadas, mesmo quando a camada ainda é simples.
 *   - Fábricas e injeção de dependências.
 * ============================================================================
 */
