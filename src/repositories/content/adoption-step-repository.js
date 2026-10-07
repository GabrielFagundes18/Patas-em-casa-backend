const pool = require('../../db/pool');

async function listActive() {
  const result = await pool.query(
    `SELECT step_order AS ordem, title AS titulo, description AS descricao
     FROM adoption_steps
     WHERE is_active IS NOT FALSE
     ORDER BY step_order`
  );
  return result.rows;
}

module.exports = { listActive };
