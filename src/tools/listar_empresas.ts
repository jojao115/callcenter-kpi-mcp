import { definirFerramenta } from './_shared.js';

export const listarEmpresas = definirFerramenta({
  nome: 'listar_empresas',
  titulo: 'Empresas, filas e período disponível',
  descricao:
    'Lista as empresas atendidas, as filas de cada uma (com ids), quantos operadores ativos há ' +
    'e o primeiro e o último dia com dados. Chame primeiro para descobrir ids e datas válidas.',
  entrada: {},
  async executar(ctx) {
    const empresas = await ctx.db.query<{
      id: number;
      nome: string;
      operadores_ativos: number;
      filas: { id: number; nome: string }[];
    }>(
      `SELECT e.id, e.nome,
              (SELECT count(*)::int FROM operadores o WHERE o.empresa_id = e.id AND o.ativo)
                AS operadores_ativos,
              (SELECT json_agg(json_build_object('id', f.id, 'nome', f.nome) ORDER BY f.id)
                 FROM filas f WHERE f.empresa_id = e.id) AS filas
         FROM empresas e
        ORDER BY e.id`,
    );
    const periodo = await ctx.db.query<{ de: string | null; ate: string | null }>(
      `SELECT min(dia)::text AS de, max(dia)::text AS ate FROM mv_dia_operador`,
    );
    return {
      empresas: empresas.rows,
      dados_disponiveis: periodo.rows[0] ?? { de: null, ate: null },
      fuso: 'America/Sao_Paulo',
    };
  },
});
