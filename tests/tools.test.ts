import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { atendimentoDetalhe } from '../src/tools/atendimento_detalhe.js';
import { compararEmpresas } from '../src/tools/comparar_empresas.js';
import { csatPorOperador } from '../src/tools/csat_por_operador.js';
import { listarEmpresas } from '../src/tools/listar_empresas.js';
import { previsaoVolume } from '../src/tools/previsao_volume.js';
import { rankingOperadores } from '../src/tools/ranking_operadores.js';
import { rechamadas } from '../src/tools/rechamadas.js';
import { taxaAbandono } from '../src/tools/taxa_abandono.js';
import { tmePorPeriodo } from '../src/tools/tme_por_periodo.js';
import { volumePorHora } from '../src/tools/volume_por_hora.js';
import type { Contexto, Ferramenta } from '../src/tools/_shared.js';
import { SEMANA, fixture } from './fixture.js';
import { contexto, criarBancoDeTeste, type BancoDeTeste } from './helpers.js';

// Os testes leem o resultado como JSON, do jeito que o modelo recebe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

let banco: BancoDeTeste;
let ctx: Contexto;

beforeAll(async () => {
  banco = await criarBancoDeTeste(fixture);
  ctx = contexto(banco.pool);
});
afterAll(() => banco.fechar());

const rodar = (f: Ferramenta, args: Record<string, unknown> = {}) =>
  f.executar(ctx, args) as Promise<Json>;

describe('listar_empresas', () => {
  it('lista empresas, filas e o período com dados', async () => {
    const r = await rodar(listarEmpresas);
    expect(r.empresas).toHaveLength(2);
    expect(r.empresas[0]).toMatchObject({ id: 1, nome: 'Empresa Um', operadores_ativos: 3 });
    expect(r.empresas[0].filas).toEqual([
      { id: 1, nome: 'Suporte técnico' },
      { id: 2, nome: 'Financeiro' },
    ]);
    // O atendimento 7 é 23h30 de quarta em São Paulo: conta no dia 11, não no 12 do UTC.
    expect(r.dados_disponiveis).toEqual({ de: '2026-11-10', ate: '2026-11-12' });
  });
});

describe('tme_por_periodo', () => {
  it('calcula TME e TMA por dia, só com atendidos', async () => {
    const r = await rodar(tmePorPeriodo, { ...SEMANA, empresa_id: 1, fila_id: 1 });
    expect(r.linhas[0]).toEqual({
      periodo: '2026-11-10',
      volume: 4,
      atendidos: 3,
      tme: '1:10',
      tme_seg: 70,
      tma: '10:00',
      tma_seg: 600,
    });
  });

  it('agrupa no total', async () => {
    const r = await rodar(tmePorPeriodo, { ...SEMANA, empresa_id: 2, agrupar_por: 'total' });
    expect(r.linhas).toEqual([
      {
        periodo: 'total',
        volume: 2,
        atendidos: 1,
        tme: '5:00',
        tme_seg: 300,
        tma: '20:00',
        tma_seg: 1200,
      },
    ]);
  });

  it('usa os 7 dias até ontem quando não recebe datas', async () => {
    const r = await rodar(tmePorPeriodo);
    expect(r.periodo).toEqual({ inicio: '2026-11-09', fim: '2026-11-15', dias: 7 });
  });

  it('recusa período invertido e período longo demais', async () => {
    await expect(
      rodar(tmePorPeriodo, { data_inicio: '2026-11-15', data_fim: '2026-11-09' }),
    ).rejects.toThrow('data_inicio precisa ser igual ou anterior a data_fim');
    await expect(
      rodar(tmePorPeriodo, { data_inicio: '2024-01-01', data_fim: '2026-11-09' }),
    ).rejects.toThrow('no máximo 366 dias');
  });

  it('recusa data inexistente e agrupamento fora da lista', async () => {
    await expect(rodar(tmePorPeriodo, { data_fim: '2026-02-30' })).rejects.toThrow(
      'data inexistente',
    );
    await expect(
      rodar(tmePorPeriodo, { agrupar_por: "dia'; DROP TABLE atendimentos; --" }),
    ).rejects.toThrow();
  });
});

describe('volume_por_hora', () => {
  it('monta o mapa de calor com média por dia e acha o pico', async () => {
    const r = await rodar(volumePorHora, { ...SEMANA, empresa_id: 1 });
    expect(r.horas).toEqual([8, 9, 10, 15]);
    const terca = r.linhas.find((l: Json) => l.dia_semana === 'ter');
    expect(terca.media_por_hora).toEqual([0, 3, 0, 1]);
    expect(r.pico).toEqual({ dia_semana: 'ter', hora: 9, media: 3 });
  });

  it('divide pelo número de dias da semana no período', async () => {
    // Duas semanas: a terça 10/11 continua com 3 atendimentos às 9h, mas agora há duas terças.
    const r = await rodar(volumePorHora, {
      data_inicio: '2026-11-02',
      data_fim: '2026-11-15',
      empresa_id: 1,
    });
    expect(r.pico).toEqual({ dia_semana: 'ter', hora: 9, media: 1.5 });
  });
});

describe('csat_por_operador', () => {
  it('ordena pela média e ignora quem não teve resposta', async () => {
    const r = await rodar(csatPorOperador, { ...SEMANA, minimo_respostas: 1 });
    expect(
      r.linhas.map((l: Json) => [l.operador, l.csat_medio, l.pct_satisfeitos, l.respostas]),
    ).toEqual([
      ['Ana', 4.5, 100, 2],
      ['Bruno', 3.5, 50, 2],
      ['Davi', 3, 0, 1],
    ]);
  });

  it('aplica o mínimo de respostas e a ordem dos piores', async () => {
    const r = await rodar(csatPorOperador, { ...SEMANA, minimo_respostas: 2, ordem: 'piores' });
    expect(r.linhas.map((l: Json) => l.operador)).toEqual(['Bruno', 'Ana']);
  });
});

describe('rechamadas', () => {
  it('conta a volta do cliente dentro de 24h para quem atendeu o primeiro contato', async () => {
    const r = await rodar(rechamadas, { ...SEMANA, empresa_id: 1 });
    expect(
      r.linhas.map((l: Json) => [l.nome, l.atendidos, l.rechamadas, l.taxa_rechamada_pct]),
    ).toEqual([
      ['Ana (Empresa Um)', 2, 1, 50],
      ['Bruno (Empresa Um)', 2, 0, 0],
      ['Carla (Empresa Um)', 1, 0, 0],
    ]);
  });

  it('com janela de 48h pega a volta do dia 12', async () => {
    const r = await rodar(rechamadas, {
      ...SEMANA,
      empresa_id: 1,
      janela_horas: 48,
      agrupar_por: 'empresa',
    });
    expect(r.linhas).toEqual([
      { id: 1, nome: 'Empresa Um', atendidos: 5, rechamadas: 2, taxa_rechamada_pct: 40 },
    ]);
  });

  it('conta a volta mesmo quando ela cai depois do fim do período', async () => {
    const r = await rodar(rechamadas, {
      data_inicio: '2026-11-10',
      data_fim: '2026-11-10',
      agrupar_por: 'empresa',
    });
    expect(r.linhas[0]).toMatchObject({ atendidos: 3, rechamadas: 1 });
    const r48 = await rodar(rechamadas, {
      data_inicio: '2026-11-10',
      data_fim: '2026-11-10',
      agrupar_por: 'empresa',
      janela_horas: 48,
    });
    expect(r48.linhas[0]).toMatchObject({ atendidos: 3, rechamadas: 2 });
  });
});

describe('ranking_operadores', () => {
  it('ordena por volume com desempate pelo id', async () => {
    const r = await rodar(rankingOperadores, SEMANA);
    expect(r.linhas.map((l: Json) => [l.posicao, l.operador, l.atendidos])).toEqual([
      [1, 'Ana', 2],
      [2, 'Bruno', 2],
      [3, 'Carla', 1],
      [4, 'Davi', 1],
    ]);
  });

  it('TMA ascendente = mais rápidos primeiro', async () => {
    const r = await rodar(rankingOperadores, {
      ...SEMANA,
      ordenar_por: 'tma',
      ordem: 'asc',
      limite: 2,
    });
    expect(r.linhas.map((l: Json) => [l.operador, l.tma])).toEqual([
      ['Carla', '4:00'],
      ['Ana', '7:30'],
    ]);
    expect(r.truncado).toBe(true);
  });

  it('deixa sem CSAT no fim da lista quando ordena por CSAT', async () => {
    const r = await rodar(rankingOperadores, { ...SEMANA, ordenar_por: 'csat' });
    expect(r.linhas.at(-1)).toMatchObject({ operador: 'Carla', csat_medio: null });
  });

  it('respeita o teto de linhas do servidor', async () => {
    const r = (await rankingOperadores.executar(contexto(banco.pool, '2026-11-16', 1), {
      ...SEMANA,
      limite: 50,
    })) as Json;
    expect(r.linhas).toHaveLength(1);
    expect(r.truncado).toBe(true);
  });
});

describe('taxa_abandono', () => {
  it('por empresa', async () => {
    const r = await rodar(taxaAbandono, { ...SEMANA, agrupar_por: 'empresa' });
    expect(r.linhas).toEqual([
      { grupo: 'Empresa Dois', volume: 2, abandonos: 1, taxa_abandono_pct: 50 },
      { grupo: 'Empresa Um', volume: 6, abandonos: 1, taxa_abandono_pct: 16.7 },
    ]);
    expect(r.total).toEqual({ volume: 8, abandonos: 1 + 1, taxa_abandono_pct: 25 });
  });

  it('por dia, no fuso de São Paulo', async () => {
    const r = await rodar(taxaAbandono, { ...SEMANA, empresa_id: 2, agrupar_por: 'dia' });
    expect(r.linhas).toEqual([
      { grupo: '2026-11-11', volume: 2, abandonos: 1, taxa_abandono_pct: 50 },
    ]);
  });
});

describe('comparar_empresas', () => {
  it('põe as empresas lado a lado', async () => {
    const r = await rodar(compararEmpresas, SEMANA);
    expect(r.empresas[1]).toEqual({
      empresa_id: 2,
      empresa: 'Empresa Dois',
      volume: 2,
      atendidos: 1,
      taxa_abandono_pct: 50,
      tme: '5:00',
      tma: '20:00',
      csat_medio: 3,
      pct_satisfeitos: 0,
    });
  });

  it('mostra a empresa mesmo sem atendimento no período', async () => {
    const r = await rodar(compararEmpresas, { data_inicio: '2026-01-01', data_fim: '2026-01-07' });
    expect(r.empresas[0]).toMatchObject({
      volume: 0,
      tme: null,
      csat_medio: null,
      taxa_abandono_pct: null,
    });
  });
});

describe('atendimento_detalhe', () => {
  it('mostra o atendimento e os outros contatos do cliente', async () => {
    const r = await rodar(atendimentoDetalhe, { id: 1 });
    expect(r.atendimento).toMatchObject({
      id: 1,
      empresa: 'Empresa Um',
      operador: 'Ana',
      inicio: '2026-11-10 09:00:00',
      atendido_em: '2026-11-10 09:01:00',
      espera: '1:00',
      duracao: '10:00',
      csat: 5,
    });
    expect(r.atendimento).not.toHaveProperty('espera_seg');
    expect(r.outros_contatos_do_cliente_7_dias.map((o: Json) => o.id)).toEqual([3, 8]);
  });

  it('avisa quando o id não existe', async () => {
    expect(await rodar(atendimentoDetalhe, { id: 999 })).toEqual({ encontrado: false, id: 999 });
  });
});

describe('previsao_volume', () => {
  it('parte do último dia com dados', async () => {
    const r = await rodar(previsaoVolume, { dias_a_frente: 3, semanas_historico: 1 });
    expect(r.ultimo_dia_com_dados).toBe('2026-11-12');
    expect(r.previsao.map((d: Json) => d.dia)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });

  it('com filtro, parte do último dia da própria empresa', async () => {
    // A Empresa Dois não tem nada no dia 12: um corte global contaria esse dia como zero.
    const r = await rodar(previsaoVolume, { empresa_id: 2, dias_a_frente: 1 });
    expect(r.ultimo_dia_com_dados).toBe('2026-11-11');
    expect(r.previsao[0].dia).toBe('2026-11-12');
  });
});
