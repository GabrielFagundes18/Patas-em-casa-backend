/*
 * ============================================================================
 * ARQUIVO: adoption-request-validator.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   VALIDADOR do FORMULÁRIO DE ADOÇÃO do site (POST /api/v1/public/adoption-requests).
 *   Confere animal, nome, cidade, rotina, e-mail, telefone, as duas confirmações
 *   obrigatórias, a data preferida (opcional) e um campo "armadilha" anti-robô.
 *
 * PRINCIPAIS ITENS:
 *   - MAX_ROUTINE_LENGTH, TEXT_FIELDS.
 *   - validateAdoptionRequest({ body }) (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - utils/validators (padrões) e utils/brasilia-time (data/hora).
 *   - Usado por: modules/public/public-routes.js.
 *   - No frontend: features/adoption (AdoptionFormModal).
 * ============================================================================
 */

// Padrões de e-mail, telefone e UUID.
const { EMAIL_PATTERN, PHONE_PATTERN, UUID_PATTERN } = require('../../utils/validators');
// Validação de data/hora de Brasília.
const { isValidBrasiliaDateTime } = require('../../utils/brasilia-time');

// Tamanho máximo do texto sobre o lar e a rotina.
const MAX_ROUTINE_LENGTH = 2000;

// Limites alinhados às colunas de adotantes (nome 150, email 150, telefone 20, cidade 100).
// Cada item: [campo, mensagem, mínimo, máximo].
const TEXT_FIELDS = [
  ['nome', 'Informe seu nome completo.', 2, 150],
  ['cidade', 'Informe sua cidade.', 2, 100],
  ['rotina', 'Conte um pouco sobre seu lar e rotina.', 10, MAX_ROUTINE_LENGTH],
];

/*
 * FUNÇÃO: validateAdoptionRequest
 * O que faz: valida todos os campos do formulário.
 * Parâmetros: { body }.
 * Retorno (array): detalhes de erro.
 */
function validateAdoptionRequest({ body }) {
  const details = [];

  // Animal: precisa ser um UUID.
  if (typeof body.animal_id !== 'string' || !UUID_PATTERN.test(body.animal_id)) {
    details.push({ field: 'animal_id', message: 'Animal inválido. Volte ao catálogo e escolha o animal novamente.' });
  }

  // Textos com mínimo e máximo (laço desestruturando cada item de TEXT_FIELDS).
  for (const [field, message, minLength, maxLength] of TEXT_FIELDS) {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (value.length < minLength) {
      details.push({ field, message });
    } else if (value.length > maxLength) {
      details.push({ field, message: `Use no máximo ${maxLength} caracteres.` });
    }
  }

  // E-mail.
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 150) {
    details.push({ field: 'email', message: 'Informe um e-mail válido.' });
  }

  // Telefone: caracteres permitidos, 10 a 13 dígitos e até 20 caracteres.
  const phone = typeof body.telefone === 'string' ? body.telefone.trim() : '';
  const phoneDigits = phone.replace(/\D/g, '');
  if (!PHONE_PATTERN.test(phone) || phoneDigits.length < 10 || phoneDigits.length > 13 || phone.length > 20) {
    details.push({ field: 'telefone', message: 'Informe um telefone com DDD.' });
  }

  // Confirmação obrigatória (precisa ser exatamente true).
  if (body.ambiente_seguro !== true) {
    details.push({ field: 'ambiente_seguro', message: 'Confirme que você tem um ambiente seguro para o animal.' });
  }

  // "Honeypot" (armadilha anti-robô): o campo "website" fica invisível para pessoas no site;
  // robôs que preenchem todos os campos acabam preenchendo este também e o envio é recusado.
  if (body.website) {
    details.push({ field: 'website', message: 'Não foi possível enviar a solicitação.' });
  }

  // Segunda confirmação obrigatória.
  if (body.ciente_pos_adocao !== true) {
    details.push({ field: 'ciente_pos_adocao', message: 'Confirme que está ciente do acompanhamento pós-adoção.' });
  }

  // Sugestão do adotante para a visita (opcional); a equipe confirma o horário ao agendar.
  if (body.visita_preferida_em !== undefined && body.visita_preferida_em !== null && body.visita_preferida_em !== ''
    && !isValidBrasiliaDateTime(body.visita_preferida_em)) {
    details.push({ field: 'visita_preferida_em', message: 'Informe a data e o horário preferidos no formato AAAA-MM-DDTHH:mm.' });
  }

  return details;
}

// Exporta a função diretamente.
module.exports = validateAdoptionRequest;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O formulário chega na rota pública → limite de envios por IP → este validador
 *   → se houver detalhes, 422 com as mensagens por campo; senão, o service grava.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Validar formulários públicos no servidor.
 *   - Técnica "honeypot" contra spam de robôs.
 *   - Alinhar limites de validação com o tamanho das colunas do banco.
 *   - Laço for...of com desestruturação de arrays.
 * ============================================================================
 */
