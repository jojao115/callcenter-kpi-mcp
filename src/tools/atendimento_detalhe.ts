import { z } from 'zod';
import { definirFerramenta, minSeg } from './_shared.js';

export const atendimentoDetalhe = definirFerramenta({
  nome: 'atendimento_detalhe',
  titulo: 'Detalhe de um atendimento',
  descricao:
    'Mostra um atendimento pelo id: empresa, fila, operador, canal, motivo, horários, espera, ' +
    'duração e nota, e os contatos do mesmo cliente nos 7 dias antes e depois.',
  entrada: {
    id: z.number().int().positive().describe('Id do atendimento.'),
  },
  async executar(ctx, args) {
    const r = await ctx.db.query<{
      id: number;
      empresa: string;
      fila: string;
      operador: string | null;
      cliente_id: number;
      canal: string;
      motivo: string;
      status: string;
      inicio: string;
      atendido_em: string | null;
      fim: string | null;
      espera_seg: number | null;
      duracao_seg: number | null;
      csat: number | null;
    }>(
      `SELECT a.id::int AS id, e.nome AS empresa, f.nome AS fila, o.nome AS operador,
              a.cliente_id, a.canal, a.motivo, a.status, a.csat,
              to_char(a.inicio      AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS inicio,
              to_char(a.atendido_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS atendido_em,
              to_char(a.fim         AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS fim,
              extract(epoch FROM a.atendido_em - a.inicio)::float8 AS espera_seg,
              extract(epoch FROM a.fim - a.atendido_em)::float8    AS duracao_seg
         FROM atendimentos a
         JOIN empresas e ON e.id = a.empresa_id
         JOIN filas f    ON f.id = a.fila_id
         LEFT JOIN operadores o ON o.id = a.operador_id
        WHERE a.id = $1`,
      [args.id],
    );
    const a = r.rows[0];
    if (!a) return { encontrado: false, id: args.id };

    const outros = await ctx.db.query<{ id: number; inicio: string; fila: string; status: string }>(
      `SELECT b.id::int AS id, f.nome AS fila, b.status,
              to_char(b.inicio AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS inicio
         FROM atendimentos a
         JOIN atendimentos b
           ON b.empresa_id = a.empresa_id AND b.cliente_id = a.cliente_id AND b.id <> a.id
          AND b.inicio BETWEEN a.inicio - interval '7 days' AND a.inicio + interval '7 days'
         JOIN filas f ON f.id = b.fila_id
        WHERE a.id = $1
        ORDER BY b.inicio
        LIMIT 20`,
      [args.id],
    );

    const { espera_seg, duracao_seg, ...resto } = a;
    return {
      encontrado: true,
      atendimento: {
        ...resto,
        espera: minSeg(espera_seg),
        duracao: minSeg(duracao_seg),
        fuso: 'America/Sao_Paulo',
      },
      outros_contatos_do_cliente_7_dias: outros.rows,
    };
  },
});
