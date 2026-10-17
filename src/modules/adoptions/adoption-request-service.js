/*
 * ============================================================================
 * ARQUIVO: adoption-request-service.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   SERVICE do PEDIDO DE ADOÇÃO ENVIADO PELO SITE. Recebe o formulário já
 *   validado e, numa transação: confere se o animal está disponível, encontra
 *   ou cria o adotante pelo e-mail, impede pedido repetido em aberto e grava o
 *   pedido. Devolve um "protocolo" para a pessoa acompanhar.
 *
 * PRINCIPAIS ITENS:
 *   - AVAILABLE_ANIMAL_STATUSES: status que aceitam pedidos.
 *   - formatProtocol(requestId), buildObservations(request) (internas).
 *   - createAdoptionRequestService(repository, { now }) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/app-error, utils/brasilia-time, ./adoption-request-repository.
 *   - Usado por: modules/public/public-controller.js.
 *   - Testado em: tests/unit/adoption-request-service.test.js.
 * ============================================================================
 */

// Erro da aplicação.
const AppError = require('../../utils/app-error');
// Converte "AAAA-MM-DDTHH:mm" (Brasília) em Date.
const { parseBrasiliaDateTime } = require('../../utils/brasilia-time');
// Banco.
const adoptionRequestRepository = require('./adoption-request-repository');

// Só animais disponíveis ou urgentes aceitam pedidos.
const AVAILABLE_ANIMAL_STATUSES = ['disponivel', 'urgente'];

/*
 * FUNÇÃO: formatProtocol (interna)
 * O que faz: cria um protocolo curto a partir do id do pedido.
 * Ex.: id "3b241101-e2bb-..." → "PAC-3B241101".
 */
function formatProtocol(requestId) {
  return `PAC-${String(requestId).slice(0, 8).toUpperCase()}`;
}

/*
 * FUNÇÃO: buildObservations (interna)
 * O que faz: monta o texto das observações do pedido com o que a pessoa informou.
 * Retorno (string com quebras de linha "\n").
 */
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

/*
 * FUNÇÃO: createAdoptionRequestService (fábrica)
 * Parâmetros: repository (padrão) e { now } (relógio; os testes passam uma data fixa).
 * Retorno: { create }.
 */
function createAdoptionRequestService(repository = adoptionRequestRepository, { now = () => new Date() } = {}) {
  /*
   * FUNÇÃO INTERNA: create (async)
   * O que faz: registra o pedido.
   * Parâmetros: payload (corpo validado do formulário).
   * Retorno: { protocolo, status, data_pedido, animal: { id, nome } }.
   * Erros: 422 (data no passado), 404 (animal não existe), 409 (indisponível ou pedido repetido).
   */
  async function create(payload) {
    // Data preferida para a visita (opcional) precisa ser no futuro.
    const visitaPreferidaEm = payload.visita_preferida_em ? parseBrasiliaDateTime(payload.visita_preferida_em) : null;
    if (visitaPreferidaEm && visitaPreferidaEm <= now()) {
      throw new AppError(422, 'DATA_NO_PASSADO', 'Escolha uma data futura para a visita.', [
        { field: 'visita_preferida_em', message: 'Escolha uma data futura para a visita.' },
      ]);
    }

    // Dados normalizados (sem espaços nas pontas; e-mail em minúsculas).
    const request = {
      animalId: payload.animal_id,
      nome: payload.nome.trim(),
      email: payload.email.trim().toLowerCase(),
      telefone: payload.telefone.trim(),
      cidade: payload.cidade.trim(),
      rotina: payload.rotina.trim(),
    };

    // Tudo dentro de uma transação (se algo falhar, nada fica gravado pela metade).
    return repository.withTransaction(async (db) => {
      // O animal existe e está disponível?
      const animal = await repository.findAnimalForRequest(db, request.animalId);
      if (!animal) {
        throw new AppError(404, 'ANIMAL_NAO_ENCONTRADO', 'Animal não encontrado.');
      }
      if (!AVAILABLE_ANIMAL_STATUSES.includes(animal.status)) {
        throw new AppError(409, 'ANIMAL_INDISPONIVEL', 'Este animal não está mais disponível para adoção.');
      }

      // Adotante: procura pelo e-mail; se não achar, cria; se a criação não inseriu
      // (outro envio criou ao mesmo tempo), procura de novo. "||" passa para a próxima tentativa.
      const adopterId = await repository.findAdopterIdByEmail(db, request.email)
        || await repository.insertAdopter(db, request)
        || await repository.findAdopterIdByEmail(db, request.email);

      // Um pedido em aberto por adotante e animal.
      if (await repository.hasOpenRequest(db, adopterId, request.animalId)) {
        throw new AppError(
          409,
          'PEDIDO_EM_ANDAMENTO',
          'Já existe uma solicitação em andamento para este animal com este e-mail.'
        );
      }

      // Grava o pedido com as observações montadas.
      const created = await repository.insertRequest(db, {
        animalId: request.animalId,
        adopterId,
        observacoes: buildObservations(request),
        visitaPreferidaEm,
      });

      // Resposta para o site (sem dados pessoais).
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

// Exporta uma instância pronta e a fábrica.
module.exports = { ...createAdoptionRequestService(), createAdoptionRequestService };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Formulário do site → validação → create(): confere a data → abre transação →
 *   animal disponível? → adotante (acha/cria) → sem pedido repetido → grava →
 *   devolve o protocolo.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Transações em fluxos com várias etapas dependentes.
 *   - Condições de corrida (dois envios simultâneos) e como tratá-las.
 *   - Não sobrescrever dados existentes com dados vindos de formulário público.
 *   - Encadeamento de "||" com await.
 * ============================================================================
 */
