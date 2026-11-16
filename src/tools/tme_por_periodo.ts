import { z } from 'zod';
import {
  DEFINICOES,
  cortar,
  definirFerramenta,
  entradaEmpresa,
  entradaFila,
  entradaPeriodo,
  minSeg,
  resolverPeriodo,
} from './_shared.js';

// Só estes trechos entram no SQL, escolhidos por chave: nada do texto do usuário vira SQL.
const AGRUPAMENTO = {
  dia: `m.dia::text`,
  semana: `date_trunc('week', m.dia)::date::text`,
  total: `'total'`,
} as const;

export const tmePorPeriodo = definirFerramenta({
  nome: 'tme_por_periodo',
  titulo: 'TME e TMA por período',
  descricao:
    'Tempo médio de espera (TME) e tempo médio de atendimento (TMA) num período, por dia, ' +
    'por semana (começando na segunda) ou no total. Filtra por empresa e por fila.',
  entrada: {
    ...entradaPeriodo,
    ...entradaEmpresa,
    ...entradaFila,
    agrupar_por: z
      .enum(['dia', 'semana', 'total'])
      .default('dia')
      .describe('dia, semana ou total. Padrão: dia.'),
  },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const r = await ctx.db.query<{
      periodo: string;
      volume: number;
      atendidos: number;
      tme_seg: number | null;
      tma_seg: number | null;
    }>(
      `SELECT ${AGRUPAMENTO[args.agrupar_por]} AS periodo,
              sum(m.volume)::int    AS volume,
              sum(m.atendidos)::int AS atendidos,
              (sum(m.espera_seg)  / nullif(sum(m.atendidos), 0))::float8 AS tme_seg,
              (sum(m.duracao_seg) / nullif(sum(m.atendidos), 0))::float8 AS tma_seg
         FROM mv_dia_operador m
        WHERE m.dia BETWEEN $1::date AND $2::date
          AND ($3::smallint IS NULL OR m.empresa_id = $3)
          AND ($4::smallint IS NULL OR m.fila_id = $4)
        GROUP BY 1
        ORDER BY 1
        LIMIT $5`,
      [p.inicio, p.fim, args.empresa_id ?? null, args.fila_id ?? null, ctx.maxLinhas + 1],
    );
    const { linhas, truncado } = cortar(r.rows, ctx.maxLinhas);
    return {
      periodo: p,
      agrupado_por: args.agrupar_por,
      linhas: linhas.map((l) => ({
        periodo: l.periodo,
        volume: l.volume,
        atendidos: l.atendidos,
        tme: minSeg(l.tme_seg),
        tme_seg: l.tme_seg === null ? null : Math.round(l.tme_seg),
        tma: minSeg(l.tma_seg),
        tma_seg: l.tma_seg === null ? null : Math.round(l.tma_seg),
      })),
      truncado,
      definicoes: [DEFINICOES.tme, DEFINICOES.tma],
    };
  },
});
