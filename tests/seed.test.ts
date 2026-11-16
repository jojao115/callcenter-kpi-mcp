import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OFFSET_SAO_PAULO_HORAS, diaParaMs } from '../src/datas.js';
import { gerarDados, type DadosGerados } from '../src/seed/generate.js';

const impressao = (d: DadosGerados) => createHash('sha256').update(JSON.stringify(d)).digest('hex');

const OPCOES = { seed: 42, dias: 90, dataFim: '2026-11-12' };

describe('gerarDados', () => {
  const dados = gerarDados(OPCOES);
  const { atendimentos } = dados;

  it('é determinístico: mesma semente, mesmos dados', () => {
    expect(impressao(gerarDados(OPCOES))).toBe(impressao(dados));
    expect(impressao(gerarDados({ ...OPCOES, seed: 7 }))).not.toBe(impressao(dados));
  });

  it('gera 3 empresas, 9 filas, 40 operadores e cerca de 50 mil atendimentos', () => {
    expect(dados.empresas).toHaveLength(3);
    expect(dados.filas).toHaveLength(9);
    expect(dados.operadores).toHaveLength(40);
    expect(atendimentos.length).toBeGreaterThan(45_000);
    expect(atendimentos.length).toBeLessThan(60_000);
  });

  it('mantém todo atendimento dentro do período e do horário de atendimento', () => {
    const ini = diaParaMs('2026-08-15') + OFFSET_SAO_PAULO_HORAS * 3_600_000;
    const fim = diaParaMs('2026-11-13') + OFFSET_SAO_PAULO_HORAS * 3_600_000;
    const fora = atendimentos.filter((a) => {
      const hora = new Date(a.inicio - OFFSET_SAO_PAULO_HORAS * 3_600_000).getUTCHours();
      return a.inicio < ini || a.inicio >= fim || hora < 7 || hora >= 22;
    });
    expect(fora).toEqual([]);
  });

  it('respeita as regras de cada status', () => {
    // As mesmas regras do CHECK da tabela: o seed não pode gerar linha que o banco recusaria.
    const invalidos = atendimentos.filter((a) =>
      a.status === 'abandonado'
        ? a.operadorId !== null || a.atendidoEm !== null || a.fim !== null || a.csat !== null
        : a.operadorId === null ||
          a.atendidoEm === null ||
          a.fim === null ||
          a.atendidoEm < a.inicio ||
          a.fim <= a.atendidoEm ||
          (a.csat !== null && ![1, 2, 3, 4, 5].includes(a.csat)),
    );
    expect(invalidos).toEqual([]);
  });

  it('tem números de operação plausíveis', () => {
    const atendidos = atendimentos.filter((a) => a.status === 'finalizado');
    const abandono = 1 - atendidos.length / atendimentos.length;
    const tme =
      atendidos.reduce((s, a) => s + (a.atendidoEm! - a.inicio), 0) / atendidos.length / 1000;
    const notas = atendidos.filter((a) => a.csat !== null).map((a) => a.csat!);
    const csat = notas.reduce((s, n) => s + n, 0) / notas.length;
    expect(abandono).toBeGreaterThan(0.04);
    expect(abandono).toBeLessThan(0.15);
    expect(tme).toBeGreaterThan(30);
    expect(tme).toBeLessThan(180);
    expect(csat).toBeGreaterThan(3.5);
    expect(csat).toBeLessThan(4.5);
  });

  it('segunda tem mais volume que domingo', () => {
    const porDiaSemana = new Array<number>(7).fill(0);
    for (const a of atendimentos) {
      const d = new Date(a.inicio - OFFSET_SAO_PAULO_HORAS * 3_600_000).getUTCDay();
      porDiaSemana[d]! += 1;
    }
    expect(porDiaSemana[1]!).toBeGreaterThan(2 * porDiaSemana[0]!);
  });

  it('tem clientes que voltam a chamar', () => {
    const contatos = new Map<string, number>();
    for (const a of atendimentos) {
      const k = `${a.empresaId}-${a.clienteId}`;
      contatos.set(k, (contatos.get(k) ?? 0) + 1);
    }
    const repetidos = [...contatos.values()].filter((n) => n > 1).length;
    expect(repetidos).toBeGreaterThan(1000);
  });

  it('recusa data inválida', () => {
    expect(() => gerarDados({ ...OPCOES, dataFim: '2026-13-01' })).toThrow('Data inválida');
  });
});
