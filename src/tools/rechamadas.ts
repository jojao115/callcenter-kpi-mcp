import { z } from 'zod';
import {
  DEFINICOES,
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

// Chave e rótulo de cada agrupamento. Só estes trechos entram no SQL.
const AGRUPAMENTO = {
  operador: { chave: 'o.id', rotulo: `o.nome || ' (' || e.nome || ')'` },
  fila: { chave: 'f.id', rotulo: `f.nome || ' (' || e.nome || ')'` },
  empresa: { chave: 'e.id', rotulo: 'e.nome' },
} as const;

export const rechamadas = definirFerramenta({
  nome: 'rechamadas',
  titulo: 'Rechamadas',
  descricao:
    'Quantos atendimentos finalizados tiveram rechamada: o mesmo cliente voltou a abrir ' +
    'atendimento dentro da janela de horas. Rechamada alta indica problema não resolvido. ' +
    'Agrupa por operador (quem atendeu o primeiro contato), fila ou empresa, do maior número para o menor.',
  entrada: {
    ...entradaPeriodo,
    ...entradaEmpresa,
    ...entradaFila,
    janela_horas: z
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24)
      .describe('Janela depois do fim do atendimento, em horas (1 a 168). Padrão: 24.'),
    agrupar_por: z
      .enum(['operador', 'fila', 'empresa'])
      .default('operador')
      .describe('Padrão: operador.'),
    ...entradaLimite(10),
  },
  async executar(ctx, args) {
    const p = resolverPeriodo(args, ctx.hoje());
    const limite = limitar(ctx, args.limite);
    const g = AGRUPAMENTO[args.agrupar_por];
    // O próximo contato do cliente pode cair depois do fim do período: busca até fim + janela.
    const r = await ctx.db.query<{
      id: number;
      nome: string;
      atendidos: number;
      rechamadas: number;
    }>(
      `WITH base AS (
         SELECT ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')       AS ini,
                (($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS fim,
                make_interval(hours => $5::int)                               AS janela
       ),
       -- A janela conta do fim de cada atendimento, que pode passar da meia-noite do último dia.
       limites AS (
         SELECT b.*,
                greatest(b.fim, (SELECT max(a.fim) FROM atendimentos a
                                  WHERE a.inicio >= b.ini AND a.inicio < b.fim)) + b.janela AS busca_ate
           FROM base b
       ),
       seq AS (
         SELECT a.*,
                lead(a.inicio) OVER (PARTITION BY a.empresa_id, a.cliente_id
                                     ORDER BY a.inicio, a.id) AS proximo_inicio
           FROM atendimentos a, limites l
          WHERE a.inicio >= l.ini AND a.inicio <= l.busca_ate
            AND ($3::smallint IS NULL OR a.empresa_id = $3)
       )
       SELECT ${g.chave} AS id, ${g.rotulo} AS nome,
              count(*)::int AS atendidos,
              count(*) FILTER (WHERE s.proximo_inicio <= s.fim + l.janela)::int AS rechamadas
         FROM seq s
         CROSS JOIN limites l
         JOIN operadores o ON o.id = s.operador_id
         JOIN filas f      ON f.id = s.fila_id
         JOIN empresas e   ON e.id = s.empresa_id
        WHERE s.status = 'finalizado'
          AND s.inicio < l.fim
          AND ($4::smallint IS NULL OR s.fila_id = $4)
        GROUP BY 1, 2
        ORDER BY rechamadas DESC, atendidos DESC, 1
        LIMIT $6`,
      [
        p.inicio,
        p.fim,
        args.empresa_id ?? null,
        args.fila_id ?? null,
        args.janela_horas,
        limite + 1,
      ],
    );
    const { linhas, truncado } = cortar(r.rows, limite);
    return {
      periodo: p,
      janela_horas: args.janela_horas,
      agrupado_por: args.agrupar_por,
      linhas: linhas.map((l) => ({
        id: l.id,
        nome: l.nome,
        atendidos: l.atendidos,
        rechamadas: l.rechamadas,
        taxa_rechamada_pct: pct(l.rechamadas, l.atendidos),
      })),
      truncado,
      definicoes: [DEFINICOES.rechamada],
    };
  },
});
