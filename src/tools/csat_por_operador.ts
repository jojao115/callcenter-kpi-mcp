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
  pct,
  resolverPeriodo,
} from './_shared.js';

const ORDEM = {
  melhores: 'csat_medio DESC, respostas DESC, o.id',
  piores: 'csat_medio ASC, respostas DESC, o.id',
} as const;

export const csatPorOperador = definirFerramenta({
  nome: 'csat_por_operador',
  titulo: 'CSAT por operador',
  descricao:
    'Nota média de satisfação (CSAT, 1 a 5) e % de satisfeitos por operador num período. ' +
    'Ignora quem teve poucas respostas, para a média não enganar.',
  entrada: {
    ...entradaPeriodo,
    ...entradaEmpresa,
    ...entradaFila,
    minimo_respostas: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(10)
      .describe('Respostas mínimas para o operador entrar na lista. Padrão: 10.'),
    ordem: z.enum(['melhores', 'piores']).default('melhores').describe('Padrão: melhores.'),
    ...entradaLimite(20),
  },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const limite = limitar(ctx, args.limite);
    const r = await ctx.db.query<{
      operador_id: number;
      operador: string;
      fila: string;
      empresa: string;
      respostas: number;
      satisfeitos: number;
      csat_medio: number;
    }>(
      `SELECT o.id AS operador_id, o.nome AS operador, f.nome AS fila, e.nome AS empresa,
              sum(m.csat_respostas)::int   AS respostas,
              sum(m.csat_satisfeitos)::int AS satisfeitos,
              (sum(m.csat_soma)::float8 / sum(m.csat_respostas)) AS csat_medio
         FROM mv_dia_operador m
         JOIN operadores o ON o.id = m.operador_id
         JOIN filas f      ON f.id = o.fila_id
         JOIN empresas e   ON e.id = o.empresa_id
        WHERE m.dia BETWEEN $1::date AND $2::date
          AND ($3::smallint IS NULL OR m.empresa_id = $3)
          AND ($4::smallint IS NULL OR m.fila_id = $4)
        GROUP BY o.id, f.nome, e.nome
       HAVING sum(m.csat_respostas) >= $5
        ORDER BY ${ORDEM[args.ordem]}
        LIMIT $6`,
      [
        p.inicio,
        p.fim,
        args.empresa_id ?? null,
        args.fila_id ?? null,
        args.minimo_respostas,
        limite + 1,
      ],
    );
    const { linhas, truncado } = cortar(r.rows, limite);
    return {
      periodo: p,
      ordem: args.ordem,
      minimo_respostas: args.minimo_respostas,
      linhas: linhas.map((l) => ({
        operador_id: l.operador_id,
        operador: l.operador,
        fila: l.fila,
        empresa: l.empresa,
        csat_medio: arred(l.csat_medio, 2),
        pct_satisfeitos: pct(l.satisfeitos, l.respostas),
        respostas: l.respostas,
      })),
      truncado,
      definicoes: [DEFINICOES.csat],
    };
  },
});
