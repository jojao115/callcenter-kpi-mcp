import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarPool } from '../src/db/pool.js';
import { gerarDados } from '../src/seed/generate.js';
import { criarServidor } from '../src/server.js';
import { ferramentas } from '../src/tools/index.js';
import { contexto, criarBancoDeTeste, type BancoDeTeste } from './helpers.js';

let banco: BancoDeTeste;
let client: Client;

beforeAll(async () => {
  // Dados gerados de verdade (2 semanas, escala menor): pega erro de SQL que a base pequena não pega.
  banco = await criarBancoDeTeste(
    gerarDados({ seed: 42, dias: 14, dataFim: '2026-11-15', escala: 0.3 }),
  );
  const server = criarServidor(contexto(banco.pool));
  const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'teste', version: '0.0.0' });
  await Promise.all([server.connect(ladoServidor), client.connect(ladoCliente)]);
});

afterAll(async () => {
  await client.close();
  await banco.fechar();
});

const texto = (r: Awaited<ReturnType<Client['callTool']>>) =>
  (r.content as { type: string; text: string }[])[0]!.text;

describe('servidor MCP', () => {
  it('anuncia as 10 ferramentas, todas só de leitura', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(ferramentas.map((f) => f.nome).sort());
    expect(tools).toHaveLength(10);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.description?.length).toBeGreaterThan(40);
    }
  });

  it.each(ferramentas.map((f) => f.nome))(
    '%s responde com JSON sobre dados gerados',
    async (nome) => {
      const args = nome === 'atendimento_detalhe' ? { id: 1 } : {};
      const r = await client.callTool({ name: nome, arguments: args });
      expect(r.isError).toBeFalsy();
      expect(() => JSON.parse(texto(r))).not.toThrow();
    },
  );

  it('devolve erro legível para entrada inválida', async () => {
    const r = await client.callTool({
      name: 'tme_por_periodo',
      arguments: { data_inicio: '2026-11-15', data_fim: '2026-11-01' },
    });
    expect(r.isError).toBe(true);
    expect(texto(r)).toBe('data_inicio precisa ser igual ou anterior a data_fim.');
  });

  it('recusa argumento fora do esquema antes de chegar ao banco', async () => {
    const r = await client.callTool({
      name: 'ranking_operadores',
      arguments: { ordenar_por: 'salario' },
    });
    expect(r.isError).toBe(true);
  });
});

describe('pool do servidor', () => {
  it('não deixa escrever no banco', async () => {
    const pool: pg.Pool = criarPool(banco.url, 5000);
    try {
      await expect(pool.query('DELETE FROM atendimentos')).rejects.toThrow(/read-only/);
      const r = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM atendimentos');
      expect(r.rows[0]!.n).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });
});
