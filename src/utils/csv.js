/*
 * ============================================================================
 * ARQUIVO: csv.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Gera arquivos CSV (planilhas em texto) para as EXPORTAÇÕES do painel
 *   (animais, adotantes, doações). Cuida de:
 *     - separar colunas com ";" (padrão do Excel em português);
 *     - colocar aspas quando o texto tem ";", aspas ou quebra de linha;
 *     - impedir "injeção de fórmulas" (texto que a planilha executaria como fórmula);
 *     - limitar o tamanho da exportação.
 *
 * PRINCIPAIS FUNÇÕES:
 *   - escapeCell(value): prepara o texto de uma célula (interna).
 *   - toCsv(columns, rows): monta o CSV inteiro.
 *   - formatDecimal(value): número → "12,50".
 *   - ensureExportLimit(total): erro se passar de MAX_EXPORT_ROWS linhas.
 *   - sendCsv(res, filename, csv): envia o arquivo como download.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - ./app-error.
 *   - Usado por: controllers/services de exportação (animais, adotantes, doações).
 * ============================================================================
 */

// Classe de erro da aplicação.
const AppError = require('./app-error');

// Separador de colunas.
const SEPARATOR = ';';
// Limite de linhas por exportação.
const MAX_EXPORT_ROWS = 10000;

/*
 * FUNÇÃO: escapeCell (interna)
 * O que faz: converte um valor em texto seguro para uma célula do CSV.
 * Parâmetros: value (qualquer tipo).
 * Retorno (string): '' para null/undefined; datas em ISO; texto com apóstrofo e/ou aspas quando preciso.
 */
// Células iniciadas por =, +, -, @ (ou tabulação/retorno) seriam interpretadas como fórmula
// por planilhas; o apóstrofo neutraliza a injeção de fórmulas.
function escapeCell(value) {
  // Sem valor → célula vazia.
  if (value === null || value === undefined) return '';
  // Datas viram texto ISO (ex.: 2026-10-16T12:00:00.000Z); o resto vira texto com String().
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Começa com caractere "perigoso"? Põe um apóstrofo na frente.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  // Tem aspas, ";" ou quebra de linha? Envolve em aspas e duplica as aspas internas (regra do CSV).
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/*
 * FUNÇÃO: toCsv
 * O que faz: monta o texto completo do CSV (cabeçalho + linhas).
 * Parâmetros:
 *   - columns (array): [{ label, key } ou { label, value(row) }]
 *       label = título da coluna; key = propriedade lida da linha; value = função que calcula o valor.
 *   - rows (array de objetos): os registros.
 * Retorno (string): o CSV, começando pelo BOM e com quebras de linha "\r\n".
 */
// Separador ";" e BOM UTF-8 para abrir corretamente no Excel em português.
function toCsv(columns, rows) {
  // Linha de títulos.
  const header = columns.map((column) => escapeCell(column.label)).join(SEPARATOR);
  // Uma linha por registro: usa a função "value" da coluna, se existir; senão, row[key].
  const lines = rows.map((row) => columns
    .map((column) => escapeCell(column.value ? column.value(row) : row[column.key]))
    .join(SEPARATOR));
  // O primeiro caractere do texto abaixo é um BOM invisível (U+FEFF): ele avisa ao Excel que o
  // arquivo é UTF-8 (sem ele, acentos aparecem errados). Depois vêm as linhas unidas por "\r\n".
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}

/*
 * FUNÇÃO: formatDecimal
 * O que faz: formata número com 2 casas e vírgula decimal (padrão brasileiro).
 * Parâmetros: value (number | string | null).
 * Retorno (string): ex.: 12.5 → '12,50'; vazio → ''.
 */
function formatDecimal(value) {
  if (value === null || value === undefined || value === '') return '';
  // toFixed(2) → '12.50'; replace troca o ponto pela vírgula.
  return Number(value).toFixed(2).replace('.', ',');
}

/*
 * FUNÇÃO: ensureExportLimit
 * O que faz: lança erro 422 se o total de linhas passar do limite.
 * Parâmetros: total (number) — quantidade de registros da exportação.
 * Retorno: nada (ou lança AppError).
 */
function ensureExportLimit(total) {
  if (total > MAX_EXPORT_ROWS) {
    throw new AppError(422, 'EXPORTACAO_MUITO_GRANDE', `A exportação tem ${total} linhas; o limite é ${MAX_EXPORT_ROWS}. Aplique filtros para reduzir o resultado.`);
  }
}

/*
 * FUNÇÃO: sendCsv
 * O que faz: envia o CSV como arquivo para download.
 * Parâmetros:
 *   - res (objeto de resposta do Express).
 *   - filename (string): nome do arquivo (ex.: 'animais.csv').
 *   - csv (string): conteúdo.
 * Retorno: o resultado de res.send (a resposta enviada).
 */
function sendCsv(res, filename, csv) {
  // Tipo do conteúdo: CSV em UTF-8.
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  // "attachment" faz o navegador baixar o arquivo com o nome indicado.
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

// Exporta o limite e as funções públicas (escapeCell fica interna).
module.exports = { MAX_EXPORT_ROWS, toCsv, formatDecimal, ensureExportLimit, sendCsv };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   O service conta os registros (ensureExportLimit), busca as linhas, define as
 *   colunas e chama toCsv; o controller envia com sendCsv. Cada célula passa por
 *   escapeCell (fórmulas neutralizadas, aspas corretas).
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Formato CSV: separadores, aspas e quebras de linha.
 *   - Injeção de fórmulas em planilhas (CSV injection).
 *   - BOM (Byte Order Mark) e codificação UTF-8.
 *   - Cabeçalhos Content-Type e Content-Disposition.
 *   - Expressões regulares com classes de caracteres ([...]).
 * ============================================================================
 */
