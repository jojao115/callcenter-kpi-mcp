import { z } from 'zod';
import { NOMES_DIA_SEMANA, diaDaSemana, somarDias } from '../datas.js';
import { arred, definirFerramenta, entradaEmpresa, entradaFila } from './_shared.js';

export interface DiaPrevisto {
  dia: string;
  dia_semana: string;
  previsto: number;
  minimo_historico: number;
  maximo_historico: number;
}

/**
 * Média móvel simples por dia da semana: a previsão de uma segunda é a média das
 * últimas N segundas. Dia sem registro no histórico conta como zero atendimentos.
 */
export function preverVolume(
  volumePorDia: ReadonlyMap<string, number>,
  ultimoDia: string,
  diasAFrente: number,
  semanas: number,
): DiaPrevisto[] {
  const previsao: DiaPrevisto[] = [];
  for (let k = 1; k <= diasAFrente; k++) {
    const dia = somarDias(ultimoDia, k);
    // O mesmo dia da semana mais recente que já tem dados, e as semanas antes dele.
    const maisRecente = somarDias(dia, -7 * Math.ceil(k / 7));
    const amostras: number[] = [];
    for (let s = 0; s < semanas; s++) {
      amostras.push(volumePorDia.get(somarDias(maisRecente, -7 * s)) ?? 0);
    }
    const media = amostras.reduce((a, b) => a + b, 0) / amostras.length;
    previsao.push({
      dia,
      dia_semana: NOMES_DIA_SEMANA[diaDaSemana(dia)]!,
      previsto: Math.round(media),
      minimo_historico: Math.min(...amostras),
      maximo_historico: Math.max(...amostras),
    });
  }
  return previsao;
}

export const previsaoVolume = definirFerramenta({
  nome: 'previsao_volume',
  titulo: 'Previsão de volume',
  descricao:
    'Prevê o volume de atendimentos dos próximos dias pela média das últimas semanas no mesmo ' +
    'dia da semana (média móvel simples), a partir do último dia com dados. Mostra o mínimo e o ' +
    'máximo do histórico usado, para dar a ideia da variação.',
  entrada: {
    ...entradaEmpresa,
    ...entradaFila,
    dias_a_frente: z.number().int().min(1).max(14).default(7).describe('1 a 14. Padrão: 7.'),
    semanas_historico: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(4)
      .describe('Semanas de histórico na média, 1 a 12. Padrão: 4.'),
  },
  async executar(ctx, args) {
    // Último dia com dados da própria empresa ou fila: um corte global contaria como zero
    // os dias em que só outra empresa tinha dados.
    const ultimo = await ctx.db.query<{ ultimo: string | null }>(
      `SELECT max(m.dia)::text AS ultimo
         FROM mv_dia_operador m
        WHERE ($1::smallint IS NULL OR m.empresa_id = $1)
          AND ($2::smallint IS NULL OR m.fila_id = $2)`,
      [args.empresa_id ?? null, args.fila_id ?? null],
    );
    const ultimoDia = ultimo.rows[0]?.ultimo ?? null;
    if (ultimoDia === null) return { previsao: [], aviso: 'Não há dados no banco. Rode o seed.' };

    const desde = somarDias(ultimoDia, -7 * args.semanas_historico + 1);
    const r = await ctx.db.query<{ dia: string; volume: number }>(
      `SELECT m.dia::text AS dia, sum(m.volume)::int AS volume
         FROM mv_dia_operador m
        WHERE m.dia BETWEEN $1::date AND $2::date
          AND ($3::smallint IS NULL OR m.empresa_id = $3)
          AND ($4::smallint IS NULL OR m.fila_id = $4)
        GROUP BY 1`,
      [desde, ultimoDia, args.empresa_id ?? null, args.fila_id ?? null],
    );
    const volumePorDia = new Map(r.rows.map((l) => [l.dia, l.volume]));
    const previsao = preverVolume(
      volumePorDia,
      ultimoDia,
      args.dias_a_frente,
      args.semanas_historico,
    );
    return {
      ultimo_dia_com_dados: ultimoDia,
      historico_usado: { de: desde, ate: ultimoDia, semanas: args.semanas_historico },
      previsao,
      total_previsto: previsao.reduce((a, d) => a + d.previsto, 0),
      media_diaria_prevista: arred(previsao.reduce((a, d) => a + d.previsto, 0) / previsao.length),
      metodo:
        'Média simples do mesmo dia da semana nas últimas semanas. Não considera feriados nem tendência.',
    };
  },
});
