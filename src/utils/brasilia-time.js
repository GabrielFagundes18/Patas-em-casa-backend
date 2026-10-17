/*
 * ============================================================================
 * ARQUIVO: brasilia-time.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Funções para trabalhar com DATAS E HORÁRIOS NO FUSO DE BRASÍLIA. O painel
 *   envia agendamentos (visitas, entrevistas) no formato "AAAA-MM-DDTHH:mm",
 *   que é o formato do campo <input type="datetime-local">. Aqui validamos esse
 *   texto, convertemos em Date (instante exato) e descrevemos para e-mails
 *   (ex.: "sábado, 10/10/2026 às 14:00").
 *
 * PRINCIPAIS FUNÇÕES:
 *   - isValidBrasiliaDateTime(value): o texto é uma data/hora válida?
 *   - parseBrasiliaDateTime(value): texto → Date (considerando UTC-3).
 *   - describeBrasiliaDateTime(value): texto → { diaSemana, data, hora }.
 *   - toBrasiliaDateTime(date): Date → texto "AAAA-MM-DDTHH:mm" em Brasília.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: modules/adoptions (validadores e service da triagem/agenda) e
 *     integrations/email/adoption-emails.js (texto do e-mail de agendamento).
 * ============================================================================
 */

// Datas e horários de agendamento chegam como "AAAA-MM-DDTHH:mm" no horário de Brasília
// (o painel usa <input type="datetime-local">). O Brasil não tem horário de verão desde 2019: UTC-3 fixo.
// Expressão regular que confere o formato e "captura" as partes (grupos entre parênteses):
// (\d{4}) ano; (\d{2}) mês; (\d{2}) dia; ([01]\d|2[0-3]) hora de 00 a 23; ([0-5]\d) minuto de 00 a 59.
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
// Intl.DateTimeFormat formata datas conforme idioma e fuso. Este escreve só o dia da semana por extenso.
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });

/*
 * FUNÇÃO: isValidBrasiliaDateTime
 * O que faz: confere se o valor é um texto "AAAA-MM-DDTHH:mm" com uma data que existe de verdade.
 * Parâmetros: value (qualquer tipo).
 * Retorno (boolean). Ex.: '2026-02-30T10:00' → false (30 de fevereiro não existe).
 */
function isValidBrasiliaDateTime(value) {
  // Só tenta casar o padrão se for texto; senão, match = null.
  const match = typeof value === 'string' ? value.match(DATE_TIME_PATTERN) : null;
  if (!match) return false;
  // Monta a data (meia-noite UTC) com as partes capturadas: match[1] = ano, [2] = mês, [3] = dia.
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  // A data é válida (não é "Invalid Date") e, ao reconverter, continua o mesmo dia?
  // (Datas impossíveis "transbordam", ex.: 31/04 vira 01/05, e a comparação falha.)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`;
}

/*
 * FUNÇÃO: parseBrasiliaDateTime
 * O que faz: converte "AAAA-MM-DDTHH:mm" (Brasília) em um objeto Date (instante exato).
 * Parâmetros: value (string já validada).
 * Retorno (Date). Ex.: '2026-10-10T14:00' → '2026-10-10T14:00:00-03:00' (= 17:00 UTC).
 */
function parseBrasiliaDateTime(value) {
  // Acrescenta segundos e o fuso "-03:00" para o Date entender o horário de Brasília.
  return new Date(`${value}:00-03:00`);
}

/*
 * FUNÇÃO: describeBrasiliaDateTime
 * O que faz: separa a data/hora em partes legíveis para textos e e-mails.
 * Parâmetros: value (string "AAAA-MM-DDTHH:mm" válida).
 * Retorno (objeto): { diaSemana, data, hora }.
 */
// "AAAA-MM-DDTHH:mm" → { diaSemana: 'sábado', data: '10/10/2026', hora: '14:00' }
function describeBrasiliaDateTime(value) {
  // Desestruturação de array: a vírgula inicial pula o item 0 (o texto completo) e pega os grupos.
  const [, year, month, day, hour, minute] = value.match(DATE_TIME_PATTERN);
  return {
    // Dia da semana por extenso, calculado no fuso de São Paulo.
    diaSemana: weekdayFormatter.format(parseBrasiliaDateTime(value)),
    // Data no formato brasileiro.
    data: `${day}/${month}/${year}`,
    hora: `${hour}:${minute}`,
  };
}

// Formatador que devolve as PARTES de uma data (ano, mês, dia, hora, minuto) no fuso de Brasília.
// 'en-CA' é usado porque produz números com 2 dígitos e ano com 4; hourCycle 'h23' = horas de 00 a 23.
const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/*
 * FUNÇÃO: toBrasiliaDateTime
 * O que faz: converte um instante (Date ou texto ISO) para "AAAA-MM-DDTHH:mm" no horário de Brasília.
 * Parâmetros: date (Date | string | number).
 * Retorno (string). Ex.: '2026-10-10T17:00:00Z' → '2026-10-10T14:00'.
 */
// Date → "AAAA-MM-DDTHH:mm" no horário de Brasília (o formato do <input type="datetime-local"> do painel).
function toBrasiliaDateTime(date) {
  // formatToParts devolve [{ type: 'year', value: '2026' }, { type: 'literal', value: '-' }, ...].
  // Transformamos em objeto: { year: '2026', month: '10', ... }.
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(date)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Exporta as quatro funções.
module.exports = { isValidBrasiliaDateTime, parseBrasiliaDateTime, describeBrasiliaDateTime, toBrasiliaDateTime };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O painel envia "AAAA-MM-DDTHH:mm"; isValidBrasiliaDateTime valida; parseBrasiliaDateTime
 *   transforma em instante (UTC-3) para gravar no banco; describeBrasiliaDateTime
 *   gera os textos dos e-mails; toBrasiliaDateTime faz o caminho de volta para o painel.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Fusos horários, UTC e o formato ISO 8601 (ex.: 2026-10-10T14:00:00-03:00).
 *   - Objeto Date e validação de datas impossíveis.
 *   - Intl.DateTimeFormat (format e formatToParts).
 *   - Expressões regulares com grupos de captura e desestruturação de arrays.
 * ============================================================================
 */
