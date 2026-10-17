/*
 * ============================================================================
 * ARQUIVO: password-policy.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Define a POLÍTICA DE SENHA do painel: mínimo de 10 caracteres, pelo menos
 *   uma letra e um número, e no máximo 72 bytes (limite do bcrypt, o algoritmo
 *   que transforma a senha em "hash" antes de guardar no banco).
 *
 * PRINCIPAIS ITENS:
 *   - MIN_PASSWORD_LENGTH (exportado) e MAX_PASSWORD_BYTES.
 *   - getPasswordProblems(password): lista os problemas da senha (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - Usado por: validadores de senha (auth: troca/redefinição; users: cadastro e
 *     nova senha) e scripts/definir-senha.js.
 *   - O frontend mostra os problemas devolvidos (ex.: "Inclua ao menos um número.").
 * ============================================================================
 */

// Tamanho mínimo (em caracteres) e máximo (em bytes).
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES = 72;

/*
 * FUNÇÃO: getPasswordProblems
 * O que faz: verifica a senha contra cada regra da política.
 * Parâmetros: password (qualquer tipo; esperado string).
 * Retorno (array de strings): mensagens dos problemas; [] (vazio) quando a senha é aceita.
 */
// Política de senha forte: tamanho mínimo, letras e números, e limite de 72 bytes do bcrypt
// (acima disso o bcrypt ignoraria o restante da senha).
function getPasswordProblems(password) {
  // Não é texto (ausente, número...): um único problema.
  if (typeof password !== 'string') return ['Informe a senha.'];

  const problems = [];
  // Curta demais.
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  // Sem letra: a classe [A-Za-zÀ-ÿ] inclui letras acentuadas.
  if (!/[A-Za-zÀ-ÿ]/.test(password)) problems.push('Inclua ao menos uma letra.');
  // Sem número (\d = dígito).
  if (!/\d/.test(password)) problems.push('Inclua ao menos um número.');
  // Buffer.byteLength conta BYTES em UTF-8 (letras acentuadas e emojis ocupam mais de 1 byte).
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) problems.push(`Use no máximo ${MAX_PASSWORD_BYTES} bytes.`);
  return problems;
}

// Exporta o tamanho mínimo (usado em mensagens) e a função.
module.exports = { MIN_PASSWORD_LENGTH, getPasswordProblems };

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Os validadores chamam getPasswordProblems(senha); se a lista vier com itens,
 *   a API responde com erro (422) e essas mensagens como detalhes, e o painel as exibe.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Políticas de senha e o algoritmo bcrypt (hash com "sal", limite de 72 bytes).
 *   - Caracteres x bytes em UTF-8 (Buffer.byteLength).
 *   - Expressões regulares simples para validar conteúdo.
 *   - Devolver TODOS os problemas de uma vez (melhor experiência para quem digita).
 * ============================================================================
 */
