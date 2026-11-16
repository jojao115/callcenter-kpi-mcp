import pg from 'pg';

/** O mínimo que as ferramentas precisam do banco: rodar uma consulta parametrizada. */
export interface Banco {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

/**
 * Pool de conexões só de leitura. Além do usuário do banco já ser só de leitura,
 * cada sessão abre com transação read-only e tempo máximo por consulta.
 */
export function criarPool(connectionString: string, statementTimeoutMs: number): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 4,
    // Sem isto, uma conexão que nunca termina de abrir prende uma vaga do pool para sempre.
    connectionTimeoutMillis: 10_000,
    statement_timeout: statementTimeoutMs,
    options: '-c default_transaction_read_only=on',
    application_name: 'callcenter-kpi-mcp',
  });
}
