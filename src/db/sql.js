/*
 * ============================================================================
 * ARQUIVO: sql.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Ajuda os repositories a MONTAR CONSULTAS SQL com segurança. Os valores
 *   digitados pelo usuário nunca são colados direto no texto do SQL: eles vão
 *   como PARÂMETROS ($1, $2, ...), e o banco os trata como dados, nunca como
 *   comandos. Isso evita o ataque chamado "SQL Injection".
 *
 * PRINCIPAIS FUNÇÕES:
 *   - createWhere(): monta um WHERE com várias condições ("filtros").
 *   - buildUpdate(changes, allowedColumns, id): monta o SET de um UPDATE parcial.
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado pelos repositories (animal-repository, adopter-repository,
 *     donation-repository, volunteer-repository, story-repository, user-repository...).
 * ============================================================================
 */

// Montagem de trechos de SQL parametrizado comuns aos repositories.
// Valores sempre vão como parâmetro ($n); nomes de coluna vêm de listas fixas no código, nunca do cliente.

/*
 * FUNÇÃO: createWhere
 * O que faz: cria um "montador" de cláusula WHERE.
 * Parâmetros: nenhum.
 * Retorno (objeto):
 *   - values: array com os valores dos parâmetros, na ordem ($1, $2...).
 *   - param(value): guarda um valor e devolve o marcador dele (ex.: "$3").
 *   - add(sql, value): adiciona uma condição; cada "?" do texto vira o marcador do valor.
 *   - addRaw(sql): adiciona uma condição fixa, sem valor (ex.: "excluido_em IS NULL").
 *   - clause(): devolve "WHERE cond1 AND cond2 ..." ou '' se não houver condições.
 * Exemplo:
 *   const where = createWhere();
 *   where.add('(nome ILIKE ? OR email ILIKE ?)', '%ana%');  // os dois "?" viram $1
 *   where.clause() → "WHERE (nome ILIKE $1 OR email ILIKE $1)"; where.values → ['%ana%']
 */
// WHERE com "?" como marcador: cada "?" de uma condição vira o $n do valor dela
// (o mesmo valor pode aparecer mais de uma vez, ex.: busca por nome OU e-mail).
function createWhere() {
  // Condições (trechos de SQL) e valores dos parâmetros.
  const conditions = [];
  const values = [];

  // Guarda o valor e devolve seu marcador: o 1º valor é "$1", o 2º "$2"...
  // Esta função "lembra" de conditions/values mesmo depois que createWhere termina (isso é uma "closure").
  function param(value) {
    values.push(value);
    return `$${values.length}`;
  }

  // Objeto devolvido: os métodos usam as listas acima.
  return {
    values,
    param,
    // replaceAll('?', ...) troca TODOS os "?" pelo mesmo marcador.
    add(sql, value) {
      conditions.push(sql.replaceAll('?', param(value)));
    },
    // Condição sem parâmetro.
    addRaw(sql) {
      conditions.push(sql);
    },
    // Junta as condições com AND. Sem condições, devolve texto vazio (consulta sem filtro).
    clause() {
      return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    },
  };
}

/*
 * FUNÇÃO: buildUpdate
 * O que faz: monta a parte "SET coluna = $n, ..." de um UPDATE só com as colunas permitidas.
 * Parâmetros:
 *   - changes (objeto): alterações pedidas, ex.: { nome: 'Rex', porte: 'medio' }.
 *   - allowedColumns (Set): colunas que podem ser alteradas (lista fixa no repository).
 *   - id (qualquer): id do registro a atualizar.
 * Retorno: null se nada mudar; senão { set, values, idParam }.
 * Exemplo:
 *   buildUpdate({ nome: 'Rex', porte: 'medio' }, new Set(['nome', 'porte']), 'a1')
 *   → { set: 'nome = $1, porte = $2', values: ['Rex', 'medio', 'a1'], idParam: '$3' }
 *   Uso: `UPDATE animais SET ${set} WHERE id = ${idParam}` com os "values".
 */
// SET de um UPDATE parcial só com as colunas permitidas. Devolve null quando não há o que mudar;
// o id do registro é o último parâmetro, no placeholder idParam.
function buildUpdate(changes, allowedColumns, id) {
  // Pares [coluna, valor] filtrados: colunas fora da lista permitida são ignoradas (segurança).
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.has(column));
  // Nada a atualizar.
  if (entries.length === 0) return null;

  return {
    // "coluna = $n" para cada alteração (index começa em 0, por isso index + 1).
    set: entries.map(([column], index) => `${column} = $${index + 1}`).join(', '),
    // Valores na mesma ordem, com o id no final. "[, value]" ignora o 1º item do par (a coluna).
    values: [...entries.map(([, value]) => value), id],
    // Marcador do id: o próximo número depois das alterações.
    idParam: `$${entries.length + 1}`,
  };
}

// Exporta as duas funções.
module.exports = { createWhere, buildUpdate };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   - createWhere acumula condições e valores; cada valor ganha um marcador $n.
 *   - buildUpdate filtra as colunas permitidas e numera os marcadores do SET,
 *     deixando o id como último parâmetro.
 *   Em ambos, o texto do SQL só contém marcadores e nomes fixos; os dados do
 *   usuário viajam separados, na lista de valores.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Consultas parametrizadas e SQL Injection.
 *   - Closures (funções que "lembram" variáveis do lugar onde foram criadas).
 *   - Lista de permissões (allowlist) de colunas.
 *   - Template strings, replaceAll, Object.entries, filter, map e join.
 * ============================================================================
 */
