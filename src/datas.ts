/** São Paulo não tem horário de verão desde 2019: UTC-3 o ano todo. */
export const OFFSET_SAO_PAULO_HORAS = 3;

export const DIA_MS = 86_400_000;

/** Converte AAAA-MM-DD em milissegundos da meia-noite UTC daquele dia (para aritmética de datas). */
export function diaParaMs(dia: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) throw new Error(`Data inválida: ${dia}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(ms).toISOString().slice(0, 10) !== dia) throw new Error(`Data inválida: ${dia}`);
  return ms;
}

export function msParaDia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function somarDias(dia: string, n: number): string {
  return msParaDia(diaParaMs(dia) + n * DIA_MS);
}

/** Dia de hoje em São Paulo, AAAA-MM-DD. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return msParaDia(agora.getTime() - OFFSET_SAO_PAULO_HORAS * 3_600_000);
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(dia: string): number {
  return new Date(diaParaMs(dia)).getUTCDay();
}

export const NOMES_DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
