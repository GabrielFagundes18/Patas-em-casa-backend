const AppError = require('../../utils/app-error');
const { parseBrasiliaDateTime } = require('../../utils/brasilia-time');
const adoptionRequestRepository = require('../../repositories/adoptions/adoption-request-repository');

const AVAILABLE_ANIMAL_STATUSES = ['disponivel', 'urgente'];

function formatProtocol(requestId) {
  return `PAC-${String(requestId).slice(0, 8).toUpperCase()}`;
}

// O cadastro de um adotante existente não é sobrescrito por um formulário público;
// os contatos informados ficam registrados no próprio pedido para a equipe conferir.
function buildObservations(request) {
  return [
    'Solicitação enviada pelo site.',
    `Telefone informado: ${request.telefone}`,
    `Cidade informada: ${request.cidade}`,
    'Declarou ter ambiente seguro para o animal: sim',
    'Ciente do acompanhamento pós-adoção: sim',
    '',
    'Sobre o lar e a rotina:',
    request.rotina,
  ].join('\n');
}

function createAdoptionRequestService(repository = adoptionRequestRepository, { now = () => new Date() } = {}) {
  async function create(payload) {
    const visitaPreferidaEm = payload.visita_preferida_em ? parseBrasiliaDateTime(payload.visita_preferida_em) : null;
    if (visitaPreferidaEm && visitaPreferidaEm <= now()) {
      throw new AppError(422, 'DATA_NO_PASSADO', 'Escolha uma data futura para a visita.', [
        { field: 'visita_preferida_em', message: 'Escolha uma data futura para a visita.' },
      ]);
    }

    const request = {
      animalId: payload.animal_id,
      nome: payload.nome.trim(),
      email: payload.email.trim().toLowerCase(),
      telefone: payload.telefone.trim(),
      cidade: payload.cidade.trim(),
      rotina: payload.rotina.trim(),
    };

    return repository.withTransaction(async (db) => {
      const animal = await repository.findAnimalForRequest(db, request.animalId);
      if (!animal) {
        throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
      }
      if (!AVAILABLE_ANIMAL_STATUSES.includes(animal.status)) {
        throw new AppError(409, 'ANIMAL_INDISPONIVEL', 'Este animal não está mais disponível para adoção.');
      }

      const adopterId = await repository.findAdopterIdByEmail(db, request.email)
        || await repository.insertAdopter(db, request)
        || await repository.findAdopterIdByEmail(db, request.email);

      if (await repository.hasOpenRequest(db, adopterId, request.animalId)) {
        throw new AppError(
          409,
          'PEDIDO_EM_ANDAMENTO',
          'Já existe uma solicitação em andamento para este animal com este e-mail.'
        );
      }

      const created = await repository.insertRequest(db, {
        animalId: request.animalId,
        adopterId,
        observacoes: buildObservations(request),
        visitaPreferidaEm,
      });

      return {
        protocolo: formatProtocol(created.id),
        status: created.status,
        data_pedido: created.data_pedido,
        animal: { id: animal.id, nome: animal.nome },
      };
    });
  }

  return { create };
}

module.exports = { ...createAdoptionRequestService(), createAdoptionRequestService };
