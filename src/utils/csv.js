const AppError = require('./app-error');

const SEPARATOR = ';';
const MAX_EXPORT_ROWS = 10000;

// Células iniciadas por =, +, -, @ (ou tabulação/retorno) seriam interpretadas como fórmula
// por planilhas; o apóstrofo neutraliza a injeção de fórmulas.
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Separador ";" e BOM UTF-8 para abrir corretamente no Excel em português.
function toCsv(columns, rows) {
  const header = columns.map((column) => escapeCell(column.label)).join(SEPARATOR);
  const lines = rows.map((row) => columns
    .map((column) => escapeCell(column.value ? column.value(row) : row[column.key]))
    .join(SEPARATOR));
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}

function formatDecimal(value) {
  if (value === null || value === undefined || value === '') return '';
  return Number(value).toFixed(2).replace('.', ',');
}

function ensureExportLimit(total) {
  if (total > MAX_EXPORT_ROWS) {
    throw new AppError(422, 'EXPORTACAO_MUITO_GRANDE', `A exportação tem ${total} linhas; o limite é ${MAX_EXPORT_ROWS}. Aplique filtros para reduzir o resultado.`);
  }
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

module.exports = { MAX_EXPORT_ROWS, toCsv, formatDecimal, ensureExportLimit, sendCsv };
