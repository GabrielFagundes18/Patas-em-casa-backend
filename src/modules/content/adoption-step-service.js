const adoptionStepRepository = require('./adoption-step-repository');

function createAdoptionStepService(repository = adoptionStepRepository) {
  async function listActive() {
    return repository.listActive();
  }

  return { listActive };
}

module.exports = { ...createAdoptionStepService(), createAdoptionStepService };
