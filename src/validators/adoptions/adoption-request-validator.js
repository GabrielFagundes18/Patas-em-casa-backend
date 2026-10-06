const { EMAIL_PATTERN, PHONE_PATTERN, UUID_PATTERN } = require('../common-validators');
const { isValidBrasiliaDateTime } = require('../../utils/brasilia-time');

const MAX_ROUTINE_LENGTH = 2000;

// Limites alinhados às colunas de adotantes (nome 150, email 150, telefone 20, cidade 100).
const TEXT_FIELDS = [
  ['nome', 'Informe seu nome completo.', 2, 150],
  ['cidade', 'Informe sua cidade.', 2, 100],
  ['rotina', 'Conte um pouco sobre seu lar e rotina.', 10, MAX_ROUTINE_LENGTH],
];

function validateAdoptionRequest({ body }) {
  const details = [];

  if (typeof body.animal_id !== 'string' || !UUID_PATTERN.test(body.animal_id)) {
    details.push({ field: 'animal_id', message: 'Animal inválido. Volte ao catálogo e escolha o animal novamente.' });
  }

  for (const [field, message, minLength, maxLength] of TEXT_FIELDS) {
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (value.length < minLength) {
      details.push({ field, message });
    } else if (value.length > maxLength) {
      details.push({ field, message: `Use no máximo ${maxLength} caracteres.` });
    }
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 150) {
    details.push({ field: 'email', message: 'Informe um e-mail válido.' });
  }

  const phone = typeof body.telefone === 'string' ? body.telefone.trim() : '';
  const phoneDigits = phone.replace(/\D/g, '');
  if (!PHONE_PATTERN.test(phone) || phoneDigits.length < 10 || phoneDigits.length > 13 || phone.length > 20) {
    details.push({ field: 'telefone', message: 'Informe um telefone com DDD.' });
  }

  if (body.ambiente_seguro !== true) {
    details.push({ field: 'ambiente_seguro', message: 'Confirme que você tem um ambiente seguro para o animal.' });
  }

  if (body.website) {
    details.push({ field: 'website', message: 'Não foi possível enviar a solicitação.' });
  }

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

module.exports = validateAdoptionRequest;
