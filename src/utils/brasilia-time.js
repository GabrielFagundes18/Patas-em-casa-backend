// Datas e horários de agendamento chegam como "AAAA-MM-DDTHH:mm" no horário de Brasília
// (o painel usa <input type="datetime-local">). O Brasil não tem horário de verão desde 2019: UTC-3 fixo.
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });

function isValidBrasiliaDateTime(value) {
  const match = typeof value === 'string' ? value.match(DATE_TIME_PATTERN) : null;
  if (!match) return false;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`;
}

function parseBrasiliaDateTime(value) {
  return new Date(`${value}:00-03:00`);
}

// "AAAA-MM-DDTHH:mm" → { diaSemana: 'sábado', data: '10/10/2026', hora: '14:00' }
function describeBrasiliaDateTime(value) {
  const [, year, month, day, hour, minute] = value.match(DATE_TIME_PATTERN);
  return {
    diaSemana: weekdayFormatter.format(parseBrasiliaDateTime(value)),
    data: `${day}/${month}/${year}`,
    hora: `${hour}:${minute}`,
  };
}

module.exports = { isValidBrasiliaDateTime, parseBrasiliaDateTime, describeBrasiliaDateTime };
