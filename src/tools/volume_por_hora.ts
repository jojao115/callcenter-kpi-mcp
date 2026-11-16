import { NOMES_DIA_SEMANA, diaDaSemana, somarDias } from '../datas.js';
import {
  arred,
  definirFerramenta,
  entradaEmpresa,
  entradaFila,
  entradaPeriodo,
  resolverPeriodo,
} from './_shared.js';

export const volumePorHora = definirFerramenta({
  nome: 'volume_por_hora',
  titulo: 'Mapa de calor de volume',
  descricao:
    'Média de atendimentos abertos por dia da semana e hora do dia (mapa de calor), e o horário ' +
    'de pico. Serve para dimensionar escala. Filtra por empresa e por fila.',
  entrada: { ...entradaPeriodo, ...entradaEmpresa, ...entradaFila },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const r = await ctx.db.query<{ dow: number; hora: number; volume: number }>(
      `SELECT extract(dow FROM h.dia)::int AS dow, h.hora, sum(h.volume)::int AS volume
         FROM mv_hora h
        WHERE h.dia BETWEEN $1::date AND $2::date
          AND ($3::smallint IS NULL OR h.empresa_id = $3)
          AND ($4::smallint IS NULL OR h.fila_id = $4)
        GROUP BY 1, 2`,
      [p.inicio, p.fim, args.empresa_id ?? null, args.fila_id ?? null],
    );

    // Quantas segundas, terças... há no período: a média é por dia, não a soma.
    const ocorrencias = new Array<number>(7).fill(0);
    for (let i = 0; i < p.dias; i++) {
      const d = diaDaSemana(somarDias(p.inicio, i));
      ocorrencias[d] = (ocorrencias[d] ?? 0) + 1;
    }

    const horas = [...new Set(r.rows.map((l) => l.hora))].sort((a, b) => a - b);
    const volume = new Map(r.rows.map((l) => [`${l.dow}-${l.hora}`, l.volume]));
    let pico = { dia_semana: '', hora: -1, media: -1 };
    const ordemSemana = [1, 2, 3, 4, 5, 6, 0];
    const linhas = ordemSemana
      .filter((dow) => (ocorrencias[dow] ?? 0) > 0)
      .map((dow) => {
        const medias = horas.map((h) => {
          const media = arred((volume.get(`${dow}-${h}`) ?? 0) / (ocorrencias[dow] as number)) ?? 0;
          if (media > pico.media) pico = { dia_semana: NOMES_DIA_SEMANA[dow]!, hora: h, media };
          return media;
        });
        return { dia_semana: NOMES_DIA_SEMANA[dow], media_por_hora: medias };
      });

    return {
      periodo: p,
      horas,
      linhas,
      pico: pico.hora >= 0 ? pico : null,
      leitura:
        'Cada linha é um dia da semana; media_por_hora[i] é a média de atendimentos abertos na hora horas[i].',
    };
  },
});
