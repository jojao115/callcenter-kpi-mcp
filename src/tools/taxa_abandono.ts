import { z } from 'zod';
import {
  DEFINICOES,
  cortar,
  definirFerramenta,
  entradaEmpresa,
  entradaFila,
  entradaPeriodo,
  pct,
  resolverPeriodo,
} from './_shared.js';

// Chave, rótulo e ordem de cada agrupamento. Só estes trechos entram no SQL.
const AGRUPAMENTO = {
  fila: { chave: `f.nome || ' (' || e.nome || ')'`, ordem: 'abandonos DESC, 1' },
  hora: { chave: `lpad(h.hora::text, 2, '0') || 'h'`, ordem: '1' },
  dia: { chave: 'h.dia::text', ordem: '1' },
  empresa: { chave: 'e.nome', ordem: 'abandonos DESC, 1' },
} as const;

export const taxaAbandono = definirFerramenta({
  nome: 'taxa_abandono',
  titulo: 'Taxa de abandono',
  descricao:
    'Volume, abandonos e taxa de abandono (% de clientes que desistiram na fila) por fila, ' +
    'hora do dia, dia ou empresa.',
  entrada: {
    ...entradaPeriodo,
    ...entradaEmpresa,
    ...entradaFila,
    agrupar_por: z
      .enum(['fila', 'hora', 'dia', 'empresa'])
      .default('fila')
      .describe('Padrão: fila.'),
  },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const g = AGRUPAMENTO[args.agrupar_por];
    const r = await ctx.db.query<{ grupo: string; volume: number; abandonos: number }>(
      `SELECT ${g.chave} AS grupo,
              sum(h.volume)::int    AS volume,
              sum(h.abandonos)::int AS abandonos
         FROM mv_hora h
         JOIN filas f    ON f.id = h.fila_id
         JOIN empresas e ON e.id = h.empresa_id
        WHERE h.dia BETWEEN $1::date AND $2::date
          AND ($3::smallint IS NULL OR h.empresa_id = $3)
          AND ($4::smallint IS NULL OR h.fila_id = $4)
        GROUP BY 1
        ORDER BY ${g.ordem}
        LIMIT $5`,
      [p.inicio, p.fim, args.empresa_id ?? null, args.fila_id ?? null, ctx.maxLinhas + 1],
    );
    const { linhas, truncado } = cortar(r.rows, ctx.maxLinhas);
    const volume = linhas.reduce((a, l) => a + l.volume, 0);
    const abandonos = linhas.reduce((a, l) => a + l.abandonos, 0);
    return {
      periodo: p,
      agrupado_por: args.agrupar_por,
      linhas: linhas.map((l) => ({ ...l, taxa_abandono_pct: pct(l.abandonos, l.volume) })),
      total: truncado ? null : { volume, abandonos, taxa_abandono_pct: pct(abandonos, volume) },
      truncado,
      definicoes: [DEFINICOES.abandono],
    };
  },
});
