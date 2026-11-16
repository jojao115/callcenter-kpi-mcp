import {
  DEFINICOES,
  arred,
  definirFerramenta,
  entradaPeriodo,
  minSeg,
  pct,
  resolverPeriodo,
} from './_shared.js';

export const compararEmpresas = definirFerramenta({
  nome: 'comparar_empresas',
  titulo: 'Comparar empresas',
  descricao:
    'Põe as empresas lado a lado num período: volume, taxa de abandono, TME, TMA, CSAT médio ' +
    'e % de satisfeitos.',
  entrada: { ...entradaPeriodo },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const r = await ctx.db.query<{
      empresa_id: number;
      empresa: string;
      volume: number;
      atendidos: number;
      abandonos: number;
      tme_seg: number | null;
      tma_seg: number | null;
      csat_medio: number | null;
      respostas: number;
      satisfeitos: number;
    }>(
      `SELECT e.id AS empresa_id, e.nome AS empresa,
              coalesce(sum(m.volume), 0)::int    AS volume,
              coalesce(sum(m.atendidos), 0)::int AS atendidos,
              coalesce(sum(m.abandonos), 0)::int AS abandonos,
              (sum(m.espera_seg)  / nullif(sum(m.atendidos), 0))::float8 AS tme_seg,
              (sum(m.duracao_seg) / nullif(sum(m.atendidos), 0))::float8 AS tma_seg,
              (sum(m.csat_soma)::float8 / nullif(sum(m.csat_respostas), 0)) AS csat_medio,
              coalesce(sum(m.csat_respostas), 0)::int   AS respostas,
              coalesce(sum(m.csat_satisfeitos), 0)::int AS satisfeitos
         FROM empresas e
         LEFT JOIN mv_dia_operador m
           ON m.empresa_id = e.id AND m.dia BETWEEN $1::date AND $2::date
        GROUP BY e.id
        ORDER BY e.id`,
      [p.inicio, p.fim],
    );
    return {
      periodo: p,
      empresas: r.rows.map((l) => ({
        empresa_id: l.empresa_id,
        empresa: l.empresa,
        volume: l.volume,
        atendidos: l.atendidos,
        taxa_abandono_pct: pct(l.abandonos, l.volume),
        tme: minSeg(l.tme_seg),
        tma: minSeg(l.tma_seg),
        csat_medio: arred(l.csat_medio, 2),
        pct_satisfeitos: pct(l.satisfeitos, l.respostas),
      })),
      definicoes: [DEFINICOES.tme, DEFINICOES.tma, DEFINICOES.csat, DEFINICOES.abandono],
    };
  },
});
