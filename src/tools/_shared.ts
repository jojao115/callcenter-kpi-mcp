import { z } from 'zod';
import type { Banco } from '../db/pool.js';
import { diaParaMs, somarDias } from '../datas.js';

/** Erro de entrada que vale mostrar ao modelo como está: ele corrige a chamada. */
export class ErroDeEntrada extends Error {}

export interface Contexto {
  db: Banco;
  maxLinhas: number;
  /** Dia de hoje em São Paulo (AAAA-MM-DD). Injetado para os testes fixarem a data. */
  hoje: () => string;
}

export interface Ferramenta {
  nome: string;
  titulo: string;
  descricao: string;
  entrada: z.ZodRawShape;
  executar(ctx: Contexto, args: Record<string, unknown>): Promise<unknown>;
}

/** Define uma ferramenta com os argumentos tipados pelo próprio esquema Zod. */
export function definirFerramenta<S extends z.ZodRawShape>(def: {
  nome: string;
  titulo: string;
  descricao: string;
  entrada: S;
  executar(ctx: Contexto, args: z.infer<z.ZodObject<S>>): Promise<unknown>;
}): Ferramenta {
  const esquema = z.object(def.entrada);
  return {
    ...def,
    // O SDK já valida a entrada; validar de novo aqui protege quem chama a função direto (testes).
    executar: (ctx, args) => def.executar(ctx, esquema.parse(args)),
  };
}

// ---------- Entradas comuns ----------

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD')
  .refine((d) => {
    try {
      diaParaMs(d);
      return true;
    } catch {
      return false;
    }
  }, 'data inexistente');

export const entradaPeriodo = {
  data_inicio: data
    .optional()
    .describe('Primeiro dia, AAAA-MM-DD (fuso de São Paulo). Padrão: 7 dias antes de data_fim.'),
  data_fim: data.optional().describe('Último dia, incluído, AAAA-MM-DD. Padrão: ontem.'),
};

export const entradaEmpresa = {
  empresa_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Filtra uma empresa. Sem ele, soma todas. Os ids saem de listar_empresas.'),
};

export const entradaFila = {
  fila_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Filtra uma fila (suporte, financeiro, comercial). Os ids saem de listar_empresas.'),
};

export function entradaLimite(padrao: number) {
  return {
    limite: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(padrao)
      .describe(`Máximo de linhas na resposta. Padrão: ${padrao}.`),
  };
}

export interface Periodo {
  inicio: string;
  fim: string;
  dias: number;
}

export const MAX_DIAS_PERIODO = 366;

/** Resolve o período pedido, com padrão de 7 dias até ontem, e valida. */
export function resolverPeriodo(
  args: { data_inicio?: string | undefined; data_fim?: string | undefined },
  hoje: string,
): Periodo {
  const fim = args.data_fim ?? somarDias(hoje, -1);
  const inicio = args.data_inicio ?? somarDias(fim, -6);
  const dias = (diaParaMs(fim) - diaParaMs(inicio)) / 86_400_000 + 1;
  if (dias < 1) throw new ErroDeEntrada('data_inicio precisa ser igual ou anterior a data_fim.');
  if (dias > MAX_DIAS_PERIODO) {
    throw new ErroDeEntrada(`O período pode ter no máximo ${MAX_DIAS_PERIODO} dias.`);
  }
  return { inicio, fim, dias };
}

/** Aplica o teto do servidor ao limite pedido. */
export function limitar(ctx: Contexto, pedido: number): number {
  return Math.min(pedido, ctx.maxLinhas);
}

/** Corta as linhas no limite e avisa se havia mais. Consultar com LIMIT limite + 1. */
export function cortar<T>(linhas: T[], limite: number): { linhas: T[]; truncado: boolean } {
  return { linhas: linhas.slice(0, limite), truncado: linhas.length > limite };
}

// ---------- Formatação ----------

/** 83 → "1:23". Nulo quando não há atendimento no recorte. */
export function minSeg(segundos: number | null): string | null {
  if (segundos === null || !Number.isFinite(segundos)) return null;
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function arred(v: number | null, casas = 1): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

/** Fração em porcentagem com uma casa: 0.0923 → 9.2 */
export function pct(parte: number, total: number): number | null {
  return total > 0 ? arred((100 * parte) / total) : null;
}

export const DEFINICOES = {
  tme: 'TME: tempo médio de espera na fila até o operador atender. Só conta atendimentos atendidos.',
  tma: 'TMA: tempo médio de atendimento, do início da conversa com o operador até o fim.',
  csat: 'CSAT: nota de 1 a 5 da pesquisa de satisfação. "% satisfeitos" = notas 4 e 5 sobre as respostas.',
  abandono: 'Abandono: cliente que desistiu na fila antes de ser atendido.',
  rechamada:
    'Rechamada: o mesmo cliente abre outro atendimento na mesma empresa dentro da janela, contada a partir do fim do atendimento.',
} as const;
