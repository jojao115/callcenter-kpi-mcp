import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { OFFSET_SAO_PAULO_HORAS } from '../src/datas.js';
import type { Atendimento, DadosGerados } from '../src/seed/generate.js';
import { carregarDados } from '../src/seed/load.js';
import type { Contexto } from '../src/tools/_shared.js';
import { trocarBanco } from './setup/url.js';

export interface BancoDeTeste {
  url: string;
  pool: pg.Pool;
  fechar(): Promise<void>;
}

/** Cria um banco novo, clonado do modelo com o esquema, e carrega os dados dados. */
export async function criarBancoDeTeste(dados: DadosGerados): Promise<BancoDeTeste> {
  const adminUrl = inject('pgAdminUrl');
  const nome = `t_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${nome} TEMPLATE modelo`);
  } finally {
    await admin.end();
  }

  const url = trocarBanco(adminUrl, nome);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await carregarDados(client, dados);
  } finally {
    await client.end();
  }

  const pool = new pg.Pool({ connectionString: url, max: 4 });
  return { url, pool, fechar: () => pool.end() };
}

export function contexto(db: pg.Pool, hoje = '2026-11-16', maxLinhas = 100): Contexto {
  return { db, maxLinhas, hoje: () => hoje };
}

/** "2026-11-10 09:00:00" no horário de São Paulo → milissegundos UTC. */
export function sp(dataHora: string): number {
  return Date.parse(`${dataHora.replace(' ', 'T')}Z`) + OFFSET_SAO_PAULO_HORAS * 3_600_000;
}

/** Atendimento finalizado: começa em `inicio`, espera `espera` segundos e dura `duracao` segundos. */
export function finalizado(
  base: Pick<Atendimento, 'empresaId' | 'filaId' | 'operadorId' | 'clienteId'>,
  inicio: string,
  espera: number,
  duracao: number,
  csat: number | null,
): Atendimento {
  const t = sp(inicio);
  return {
    ...base,
    canal: 'chat',
    motivo: 'Teste',
    status: 'finalizado',
    inicio: t,
    atendidoEm: t + espera * 1000,
    fim: t + (espera + duracao) * 1000,
    csat,
  };
}

export function abandonado(
  base: Pick<Atendimento, 'empresaId' | 'filaId' | 'clienteId'>,
  inicio: string,
): Atendimento {
  return {
    ...base,
    operadorId: null,
    canal: 'telefone',
    motivo: 'Teste',
    status: 'abandonado',
    inicio: sp(inicio),
    atendidoEm: null,
    fim: null,
    csat: null,
  };
}
