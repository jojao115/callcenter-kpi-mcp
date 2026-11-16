import { describe, expect, it } from 'vitest';
import { preverVolume } from '../src/tools/previsao_volume.js';

describe('preverVolume', () => {
  // Quinta 12/11/2026 é o último dia com dados. Sextas anteriores: 06/11, 30/10, 23/10.
  const historico = new Map([
    ['2026-11-06', 100],
    ['2026-10-30', 80],
    ['2026-10-23', 60],
    ['2026-11-07', 40], // sábado
  ]);

  it('usa a média do mesmo dia da semana', () => {
    const [sexta] = preverVolume(historico, '2026-11-12', 1, 3);
    expect(sexta).toEqual({
      dia: '2026-11-13',
      dia_semana: 'sex',
      previsto: 80,
      minimo_historico: 60,
      maximo_historico: 100,
    });
  });

  it('conta como zero o dia sem registro', () => {
    const [, sabado] = preverVolume(historico, '2026-11-12', 2, 2);
    expect(sabado).toMatchObject({ dia: '2026-11-14', previsto: 20, minimo_historico: 0 });
  });

  it('na segunda semana à frente usa as mesmas amostras, sem repetir nem pular semana', () => {
    const previsao = preverVolume(historico, '2026-11-12', 8, 3);
    expect(previsao[7]).toMatchObject({ dia: '2026-11-20', dia_semana: 'sex', previsto: 80 });
  });
});
