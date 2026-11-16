import { z } from 'zod';
import {
  DEFINICOES,
  arred,
  cortar,
  definirFerramenta,
  entradaEmpresa,
  entradaFila,
  entradaLimite,
  entradaPeriodo,
  limitar,
  minSeg,
  pct,
  resolverPeriodo,
} from './_shared.js';

// Coluna de ordenação escolhida por chave. Nada do texto do usuário vira SQL.
const COLUNA = {
  volume: 'atendidos',
  tma: 'tma_seg',
  tme: 'tme_seg',
  csat: 'csat_medio',
} as const;

export const rankingOperadores = definirFerramenta({
  nome: 'ranking_operadores',
  titulo: 'Ranking de operadores',
  descricao:
    'Ranking de operadores por volume atendido, TMA, TME ou CSAT, com os quatro números de cada um. ' +
    'Ordem desc = do maior para o menor (para "mais rápido" em TMA use asc).',
  entrada: {
    ...entradaPeriodo,
    ...entradaEmpresa,
    ...entradaFila,
    ordenar_por: z
      .enum(['volume', 'tma', 'tme', 'csat'])
      .default('volume')
      .describe('Padrão: volume.'),
    ordem: z.enum(['desc', 'asc']).default('desc').describe('Padrão: desc.'),
    ...entradaLimite(10),
  },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const limite = limitar(ctx, args.limite);
    const direcao = args.ordem === 'asc' ? 'ASC' : 'DESC';
    const r = await ctx.db.query<{
      operador_id: number;
      operador: string;
      fila: string;
      empresa: string;
      atendidos: number;
      tme_seg: number | null;
      tma_seg: number | null;
      csat_medio: number | null;
      respostas: number;
      satisfeitos: number;
    }>(
      `SELECT * FROM (
         SELECT o.id AS operador_id, o.nome AS operador, f.nome AS fila, e.nome AS empresa,
                sum(m.atendidos)::int AS atendidos,
                (sum(m.espera_seg)  / nullif(sum(m.atendidos), 0))::float8 AS tme_seg,
                (sum(m.duracao_seg) / nullif(sum(m.atendidos), 0))::float8 AS tma_seg,
                (sum(m.csat_soma)::float8 / nullif(sum(m.csat_respostas), 0)) AS csat_medio,
                sum(m.csat_respostas)::int AS respostas,
                sum(m.csat_satisfeitos)::int AS satisfeitos
           FROM mv_dia_operador m
           JOIN operadores o ON o.id = m.operador_id
           JOIN filas f      ON f.id = o.fila_id
           JOIN empresas e   ON e.id = o.empresa_id
          WHERE m.dia BETWEEN $1::date AND $2::date
            AND ($3::smallint IS NULL OR m.empresa_id = $3)
            AND ($4::smallint IS NULL OR m.fila_id = $4)
          GROUP BY o.id, f.nome, e.nome
       ) t
       ORDER BY ${COLUNA[args.ordenar_por]} ${direcao} NULLS LAST, operador_id
       LIMIT $5`,
      [p.inicio, p.fim, args.empresa_id ?? null, args.fila_id ?? null, limite + 1],
    );
    const { linhas, truncado } = cortar(r.rows, limite);
    return {
      periodo: p,
      ordenado_por: args.ordenar_por,
      ordem: args.ordem,
      linhas: linhas.map((l, i) => ({
        posicao: i + 1,
        operador_id: l.operador_id,
        operador: l.operador,
        fila: l.fila,
        empresa: l.empresa,
        atendidos: l.atendidos,
        tme: minSeg(l.tme_seg),
        tma: minSeg(l.tma_seg),
        csat_medio: arred(l.csat_medio, 2),
        pct_satisfeitos: pct(l.satisfeitos, l.respostas),
        respostas_csat: l.respostas,
      })),
      truncado,
      definicoes: [DEFINICOES.tme, DEFINICOES.tma, DEFINICOES.csat],
    };
  },
});
