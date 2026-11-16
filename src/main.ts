#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { lerConfig } from './config.js';
import { hojeEmSaoPaulo } from './datas.js';
import { criarPool } from './db/pool.js';
import { criarServidor } from './server.js';

// Por stdio, o stdout é o canal do protocolo: todo log vai para o stderr.
async function main(): Promise<void> {
  const config = lerConfig();
  const pool = criarPool(config.DATABASE_URL, config.STATEMENT_TIMEOUT_MS);
  pool.on('error', (err) => console.error('[pool]', err.message));

  const server = criarServidor({
    db: pool,
    maxLinhas: config.MAX_LINHAS,
    hoje: () => hojeEmSaoPaulo(),
  });
  await server.connect(new StdioServerTransport());
  console.error('callcenter-kpi-mcp pronto (stdio).');

  const encerrar = async () => {
    await server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
