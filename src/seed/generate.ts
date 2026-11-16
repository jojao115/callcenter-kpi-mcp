import { DIA_MS, OFFSET_SAO_PAULO_HORAS, diaParaMs } from '../datas.js';
import { Random } from './random.js';

/**
 * Gera um call center fictício: empresas, filas, operadores e atendimentos.
 * Função pura: mesma semente e mesmo período, mesmos dados.
 *
 * Os números seguem padrões de operação de verdade, para as perguntas terem resposta
 * interessante: pico de manhã e no começo da tarde, segunda mais cheia que domingo,
 * espera maior no pico, abandono que cresce com a espera, operadores com ritmo e
 * nota diferentes, e clientes que voltam a chamar quando o problema não foi resolvido.
 */

export type Canal = 'chat' | 'whatsapp' | 'telefone';
export type Status = 'finalizado' | 'abandonado';

export interface Empresa {
  id: number;
  nome: string;
}

export interface Fila {
  id: number;
  empresaId: number;
  nome: string;
}

export interface Operador {
  id: number;
  empresaId: number;
  filaId: number;
  nome: string;
  ativo: boolean;
}

export interface Atendimento {
  empresaId: number;
  filaId: number;
  operadorId: number | null;
  clienteId: number;
  canal: Canal;
  motivo: string;
  status: Status;
  /** Instantes em milissegundos desde a época (UTC). */
  inicio: number;
  atendidoEm: number | null;
  fim: number | null;
  csat: number | null;
}

export interface DadosGerados {
  empresas: Empresa[];
  filas: Fila[];
  operadores: Operador[];
  atendimentos: Atendimento[];
}

export interface OpcoesGeracao {
  seed: number;
  /** Último dia gerado, no formato AAAA-MM-DD (dia de São Paulo). */
  dataFim: string;
  dias: number;
  /** Multiplica o volume diário. 1 dá cerca de 50 mil atendimentos em 90 dias. */
  escala?: number;
}

const EMPRESAS = [
  { nome: 'Alfa Fibra', volumeDia: 280, esperaFator: 1.25, clientes: 4000 },
  { nome: 'Beta Net', volumeDia: 210, esperaFator: 0.85, clientes: 3000 },
  { nome: 'Gama Telecom', volumeDia: 140, esperaFator: 1.0, clientes: 2000 },
] as const;

const FILAS = [
  {
    nome: 'Suporte técnico',
    peso: 0.6,
    esperaBaseSeg: 95,
    duracaoMedianaSeg: 540,
    motivos: ['Sem conexão', 'Internet lenta', 'Troca de senha do Wi-Fi', 'Roteador reiniciando'],
  },
  {
    nome: 'Financeiro',
    peso: 0.25,
    esperaBaseSeg: 55,
    duracaoMedianaSeg: 360,
    motivos: ['Segunda via de boleto', 'Desbloqueio em confiança', 'Negociação de débito'],
  },
  {
    nome: 'Comercial',
    peso: 0.15,
    esperaBaseSeg: 40,
    duracaoMedianaSeg: 420,
    motivos: ['Mudança de plano', 'Mudança de endereço', 'Cancelamento', 'Nova contratação'],
  },
] as const;

/** Operadores por empresa, divididos entre as filas na proporção do peso. */
const OPERADORES_POR_EMPRESA = [16, 14, 10] as const;

const NOMES = [
  'Ana',
  'Bruno',
  'Camila',
  'Diego',
  'Eduarda',
  'Felipe',
  'Gabriela',
  'Henrique',
  'Isabela',
  'João',
  'Karina',
  'Lucas',
  'Mariana',
  'Nicolas',
  'Olívia',
  'Paulo',
  'Rafaela',
  'Samuel',
  'Tatiane',
  'Vinícius',
  'Yasmin',
  'André',
  'Beatriz',
  'Caio',
  'Débora',
  'Enzo',
  'Fernanda',
  'Gustavo',
  'Helena',
  'Igor',
  'Júlia',
  'Leonardo',
  'Letícia',
  'Matheus',
  'Natália',
  'Otávio',
  'Priscila',
  'Renato',
  'Sabrina',
  'Thiago',
];
const SOBRENOMES = ['Silva', 'Souza', 'Lima', 'Costa', 'Rocha', 'Alves', 'Pereira', 'Martins'];

/** Peso do volume por hora do dia (0 a 23). Atendimento das 7h às 22h. */
const PESO_HORA = [
  0, 0, 0, 0, 0, 0, 0, 0.3, 0.8, 1.0, 1.0, 0.9, 0.6, 0.7, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3,
  0, 0,
];
const PESO_HORA_MAX = Math.max(...PESO_HORA);

/** Fator de volume por dia da semana (0 = domingo). */
const FATOR_DIA_SEMANA = [0.35, 1.15, 1.05, 1.0, 1.0, 0.95, 0.6];

const CANAIS: readonly Canal[] = ['chat', 'whatsapp', 'telefone'];
const PESO_CANAL = [0.55, 0.3, 0.15];

/** Paciência média antes de desistir da fila, em segundos. */
const PACIENCIA_MEDIA_SEG = 900;

interface PerfilOperador {
  operador: Operador;
  ritmo: number;
  notaBase: number;
}

export function gerarDados(opcoes: OpcoesGeracao): DadosGerados {
  const { seed, dataFim, dias } = opcoes;
  const escala = opcoes.escala ?? 1;
  if (!Number.isInteger(dias) || dias < 1)
    throw new Error('dias precisa ser inteiro maior que zero');

  const rnd = new Random(seed);
  const empresas: Empresa[] = [];
  const filas: Fila[] = [];
  const operadores: Operador[] = [];
  const perfis = new Map<number, PerfilOperador[]>(); // fila_id → operadores da fila

  let filaId = 0;
  let operadorId = 0;
  let nomeIdx = 0;
  EMPRESAS.forEach((emp, e) => {
    const empresaId = e + 1;
    empresas.push({ id: empresaId, nome: emp.nome });
    const totalOps = OPERADORES_POR_EMPRESA[e] as number;
    const idsFilas: number[] = [];
    for (const f of FILAS) {
      filaId += 1;
      idsFilas.push(filaId);
      filas.push({ id: filaId, empresaId, nome: f.nome });
      perfis.set(filaId, []);
    }
    for (let i = 0; i < totalOps; i++) {
      operadorId += 1;
      // Distribui pelas filas na proporção do peso, garantindo pelo menos um por fila.
      const filaIdx = i < FILAS.length ? i : rnd.weightedIndex(FILAS.map((f) => f.peso));
      const op: Operador = {
        id: operadorId,
        empresaId,
        filaId: idsFilas[filaIdx] as number,
        nome: `${NOMES[nomeIdx % NOMES.length]} ${rnd.pick(SOBRENOMES)}`,
        ativo: true,
      };
      nomeIdx += 1;
      operadores.push(op);
      perfis.get(op.filaId)?.push({
        operador: op,
        ritmo: clamp(rnd.normal(1, 0.2), 0.6, 1.6),
        notaBase: clamp(rnd.normal(4.2, 0.35), 3.2, 4.9),
      });
    }
  });

  const atendimentos: Atendimento[] = [];
  const inicioPeriodo = diaParaMs(dataFim) - (dias - 1) * DIA_MS;
  const fimPeriodoUtc = diaParaMs(dataFim) + DIA_MS + OFFSET_SAO_PAULO_HORAS * 3_600_000;

  const novoAtendimento = (
    empresaIdx: number,
    filaIdx: number,
    clienteId: number,
    inicio: number,
  ): Atendimento => {
    const emp = EMPRESAS[empresaIdx]!;
    const fila = FILAS[filaIdx]!;
    const filaIdAtual = filas.filter((f) => f.empresaId === empresaIdx + 1)[filaIdx]!.id;
    const horaLocal = new Date(inicio - OFFSET_SAO_PAULO_HORAS * 3_600_000).getUTCHours();
    const carga = (PESO_HORA[horaLocal] ?? 0) / PESO_HORA_MAX;
    const esperaMedia = fila.esperaBaseSeg * emp.esperaFator * (0.4 + 1.2 * carga * carga);
    const espera = Math.round(rnd.exponential(esperaMedia));
    const paciencia = rnd.exponential(PACIENCIA_MEDIA_SEG);
    const canal = CANAIS[rnd.weightedIndex(PESO_CANAL)]!;
    const motivo = rnd.pick(fila.motivos);

    if (espera > paciencia) {
      return {
        empresaId: empresaIdx + 1,
        filaId: filaIdAtual,
        operadorId: null,
        clienteId,
        canal,
        motivo,
        status: 'abandonado',
        inicio,
        atendidoEm: null,
        fim: null,
        csat: null,
      };
    }

    const perfil = rnd.pick(perfis.get(filaIdAtual)!);
    const duracao = Math.max(
      60,
      Math.round(rnd.logNormal(fila.duracaoMedianaSeg * perfil.ritmo, 0.45)),
    );
    let csat: number | null = null;
    if (rnd.chance(0.35)) {
      const penalidadeEspera = espera > 300 ? 0.7 : espera > 120 ? 0.25 : 0;
      const penalidadeDuracao = duracao > fila.duracaoMedianaSeg * 2 ? 0.3 : 0;
      csat = clamp(
        Math.round(rnd.normal(perfil.notaBase - penalidadeEspera - penalidadeDuracao, 0.8)),
        1,
        5,
      );
    }
    const atendidoEm = inicio + espera * 1000;
    return {
      empresaId: empresaIdx + 1,
      filaId: filaIdAtual,
      operadorId: perfil.operador.id,
      clienteId,
      canal,
      motivo,
      status: 'finalizado',
      inicio,
      atendidoEm,
      fim: atendidoEm + duracao * 1000,
      csat,
    };
  };

  for (let d = 0; d < dias; d++) {
    const diaMs = inicioPeriodo + d * DIA_MS;
    const diaSemana = new Date(diaMs).getUTCDay();
    EMPRESAS.forEach((emp, e) => {
      const volumeDia = Math.round(
        emp.volumeDia *
          escala *
          (FATOR_DIA_SEMANA[diaSemana] ?? 1) *
          clamp(rnd.normal(1, 0.08), 0.75, 1.25),
      );
      for (let i = 0; i < volumeDia; i++) {
        const hora = rnd.weightedIndex(PESO_HORA);
        const inicio =
          diaMs + (hora + OFFSET_SAO_PAULO_HORAS) * 3_600_000 + rnd.int(0, 3_599) * 1000;
        const filaIdx = rnd.weightedIndex(FILAS.map((f) => f.peso));
        const clienteId = (e + 1) * 100_000 + rnd.int(1, emp.clientes);
        atendimentos.push(novoAtendimento(e, filaIdx, clienteId, inicio));
      }
    });
  }

  // Rechamadas: o cliente volta quando o problema não foi resolvido, mais ainda depois de nota baixa.
  // Percorre a própria lista enquanto ela cresce: uma rechamada também pode gerar outra.
  for (let i = 0; i < atendimentos.length; i++) {
    const a = atendimentos[i]!;
    if (a.status !== 'finalizado' || a.fim === null) continue;
    const filaIdx = filas
      .filter((f) => f.empresaId === a.empresaId)
      .findIndex((f) => f.id === a.filaId);
    let p = 0.06 + (filaIdx === 0 ? 0.04 : 0);
    if (a.csat !== null && a.csat <= 2) p += 0.25;
    if (!rnd.chance(p)) continue;
    let volta = a.fim + Math.max(15 * 60_000, Math.round(rnd.exponential(8 * 3_600_000)));
    // Fora do horário de atendimento, a volta fica para o dia seguinte às 8h.
    const horaLocal = new Date(volta - OFFSET_SAO_PAULO_HORAS * 3_600_000).getUTCHours();
    if ((PESO_HORA[horaLocal] ?? 0) === 0) {
      const diaLocal = Math.floor((volta - OFFSET_SAO_PAULO_HORAS * 3_600_000) / DIA_MS) * DIA_MS;
      const proximoDia = horaLocal >= 22 ? diaLocal + DIA_MS : diaLocal;
      volta = proximoDia + (8 + OFFSET_SAO_PAULO_HORAS) * 3_600_000 + rnd.int(0, 3_599) * 1000;
    }
    if (volta >= fimPeriodoUtc) continue;
    const novaFila = rnd.chance(0.8) ? filaIdx : rnd.weightedIndex(FILAS.map((f) => f.peso));
    atendimentos.push(novoAtendimento(a.empresaId - 1, novaFila, a.clienteId, volta));
  }

  atendimentos.sort(
    (x, y) => x.inicio - y.inicio || x.empresaId - y.empresaId || x.clienteId - y.clienteId,
  );
  return { empresas, filas, operadores, atendimentos };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
