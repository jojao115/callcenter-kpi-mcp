import type pg from 'pg';
import type { DadosGerados } from './generate.js';

const LOTE = 5_000;

/**
 * Apaga o que houver e grava os dados gerados, numa transação só.
 * Depois atualiza as views materializadas dos indicadores.
 */
export async function carregarDados(client: pg.ClientBase, dados: DadosGerados): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(
      'TRUNCATE atendimentos, operadores, filas, empresas RESTART IDENTITY CASCADE',
    );

    await client.query(
      `INSERT INTO empresas (id, nome)
       SELECT * FROM unnest($1::smallint[], $2::text[])`,
      [dados.empresas.map((e) => e.id), dados.empresas.map((e) => e.nome)],
    );
    await client.query(
      `INSERT INTO filas (id, empresa_id, nome)
       SELECT * FROM unnest($1::smallint[], $2::smallint[], $3::text[])`,
      [
        dados.filas.map((f) => f.id),
        dados.filas.map((f) => f.empresaId),
        dados.filas.map((f) => f.nome),
      ],
    );
    await client.query(
      `INSERT INTO operadores (id, empresa_id, fila_id, nome, ativo)
       SELECT * FROM unnest($1::int[], $2::smallint[], $3::smallint[], $4::text[], $5::boolean[])`,
      [
        dados.operadores.map((o) => o.id),
        dados.operadores.map((o) => o.empresaId),
        dados.operadores.map((o) => o.filaId),
        dados.operadores.map((o) => o.nome),
        dados.operadores.map((o) => o.ativo),
      ],
    );

    for (let i = 0; i < dados.atendimentos.length; i += LOTE) {
      const lote = dados.atendimentos.slice(i, i + LOTE);
      const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
      await client.query(
        `INSERT INTO atendimentos
           (empresa_id, fila_id, operador_id, cliente_id, canal, motivo, status,
            inicio, atendido_em, fim, csat)
         SELECT * FROM unnest(
           $1::smallint[], $2::smallint[], $3::int[], $4::int[], $5::text[], $6::text[], $7::text[],
           $8::timestamptz[], $9::timestamptz[], $10::timestamptz[], $11::smallint[])`,
        [
          lote.map((a) => a.empresaId),
          lote.map((a) => a.filaId),
          lote.map((a) => a.operadorId),
          lote.map((a) => a.clienteId),
          lote.map((a) => a.canal),
          lote.map((a) => a.motivo),
          lote.map((a) => a.status),
          lote.map((a) => iso(a.inicio)),
          lote.map((a) => iso(a.atendidoEm)),
          lote.map((a) => iso(a.fim)),
          lote.map((a) => a.csat),
        ],
      );
    }

    await client.query('REFRESH MATERIALIZED VIEW mv_dia_operador');
    await client.query('REFRESH MATERIALIZED VIEW mv_hora');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
  await client.query('ANALYZE');
}
