// Montagem de trechos de SQL parametrizado comuns aos repositories.
// Valores sempre vão como parâmetro ($n); nomes de coluna vêm de listas fixas no código, nunca do cliente.

// WHERE com "?" como marcador: cada "?" de uma condição vira o $n do valor dela
// (o mesmo valor pode aparecer mais de uma vez, ex.: busca por nome OU e-mail).
function createWhere() {
  const conditions = [];
  const values = [];

  function param(value) {
    values.push(value);
    return `$${values.length}`;
  }

  return {
    values,
    param,
    add(sql, value) {
      conditions.push(sql.replaceAll('?', param(value)));
    },
    addRaw(sql) {
      conditions.push(sql);
    },
    clause() {
      return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    },
  };
}

// SET de um UPDATE parcial só com as colunas permitidas. Devolve null quando não há o que mudar;
// o id do registro é o último parâmetro, no placeholder idParam.
function buildUpdate(changes, allowedColumns, id) {
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  if (entries.length === 0) return null;

  return {
    set: entries.map(([column], index) => `${column} = $${index + 1}`).join(', '),
    values: [...entries.map(([, value]) => value), id],
    idParam: `$${entries.length + 1}`,
  };
}

module.exports = { createWhere, buildUpdate };
