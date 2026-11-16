import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import { ErroDeEntrada, type Contexto } from './tools/_shared.js';
import { ferramentas } from './tools/index.js';

export const NOME_SERVIDOR = 'callcenter-kpi-mcp';
export const VERSAO_SERVIDOR = '0.1.0';

/** Cria o servidor MCP com todas as ferramentas registradas. Não abre transporte. */
export function criarServidor(ctx: Contexto): McpServer {
  const server = new McpServer(
    { name: NOME_SERVIDOR, version: VERSAO_SERVIDOR },
    {
      instructions:
        'Indicadores de um call center fictício com 3 empresas. Comece por listar_empresas para ' +
        'ver ids e o período com dados. Datas no formato AAAA-MM-DD, fuso de São Paulo. ' +
        'Ao responder, cite o período consultado e a definição do indicador quando ela importar.',
    },
  );

  for (const f of ferramentas) {
    server.registerTool(
      f.nome,
      {
        title: f.titulo,
        description: f.descricao,
        inputSchema: f.entrada,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        try {
          const resultado = await f.executar(ctx, args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(resultado, null, 2) }] };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: mensagemDeErro(f.nome, err) }],
          };
        }
      },
    );
  }
  return server;
}

/** Erro de entrada volta como está, para o modelo corrigir a chamada. O resto não vaza detalhe do banco. */
function mensagemDeErro(ferramenta: string, err: unknown): string {
  if (err instanceof ErroDeEntrada) return err.message;
  if (err instanceof ZodError)
    return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  console.error(`[${ferramenta}]`, err);
  return 'Não foi possível consultar os indicadores agora. Tente de novo ou reduza o período.';
}
