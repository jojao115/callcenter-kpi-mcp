import pg from 'pg';
import { hojeEmSaoPaulo, somarDias } from '../datas.js';
import { gerarDados } from './generate.js';
import { carregarDados } from './load.js';

/** npm run seed: gera os dados fictícios e grava no banco de SEED_DATABASE_URL. */
async function main(): Promise<void> {
  const url = process.env.SEED_DATABASE_URL;
  if (!url) throw new Error('Defina SEED_DATABASE_URL (veja o .env.example).');

  const seed = Number(process.env.SEED ?? 42);
  const dias = Number(process.env.SEED_DIAS ?? 90);
  // Padrão: até ontem, para o último dia não ter atendimentos em horas que ainda não chegaram.
  const dataFim = process.env.SEED_DATA_FIM || somarDias(hojeEmSaoPaulo(), -1);
  if (!Number.isInteger(seed)) throw new Error('SEED precisa ser um número inteiro.');

  const dados = gerarDados({ seed, dias, dataFim });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await carregarDados(client, dados);
  } finally {
    await client.end();
  }

  const abandonos = dados.atendimentos.filter((a) => a.status === 'abandonado').length;
  console.log(
    `Seed ${seed}: ${dados.empresas.length} empresas, ${dados.operadores.length} operadores, ` +
      `${dados.atendimentos.length} atendimentos (${abandonos} abandonos) em ${dias} dias até ${dataFim}.`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
