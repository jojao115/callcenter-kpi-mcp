# callcenter-kpi-mcp

Servidor [MCP](https://modelcontextprotocol.io) que deixa um LLM (Claude, ChatGPT, Cursor) consultar os indicadores de um call center em linguagem natural: TME, TMA, CSAT, rechamadas, abandono, mapa de calor e previsão de volume.

[![CI](https://github.com/jojao115/callcenter-kpi-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jojao115/callcenter-kpi-mcp/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-green)

<!-- Demo: substituir por um GIF de 20 s do Claude Desktop respondendo uma pergunta. -->
<!-- ![Demo](docs/demo.gif) -->

> **Pergunta:** "Qual operador teve mais rechamadas semana passada?"
>
> O modelo chama `rechamadas` com o período da semana, o servidor roda uma consulta parametrizada no Postgres e o modelo responde com os números: quem atendeu, quantos clientes voltaram em 24 h e a taxa de cada um.

## O problema

Supervisor de call center vive de indicador: espera na fila, nota do cliente, quem resolve de primeira, que horário precisa de mais gente. Esses números ficam num banco que só quem sabe SQL consulta, ou num painel que responde só às perguntas que alguém pensou antes.

Com MCP, o supervisor pergunta do jeito que fala, e o modelo escolhe a ferramenta certa. Cada ferramenta é uma consulta revisada, com entrada validada e só leitura: o modelo nunca escreve SQL.

## Como funciona

```mermaid
flowchart LR
    U[Supervisor] -->|pergunta| L[LLM<br/>Claude, Cursor...]
    L -->|chama ferramenta<br/>JSON validado por Zod| S[callcenter-kpi-mcp<br/>stdio]
    S -->|SQL parametrizado<br/>usuário só de leitura| P[(PostgreSQL<br/>views materializadas)]
    P --> S --> L -->|resposta com números| U
```

**Stack:** TypeScript (strict) · Node 22 · MCP SDK · PostgreSQL 17 · Zod · Vitest + Testcontainers · Docker Compose · GitHub Actions

### Ferramentas

| Ferramenta            | Responde                                                                  |
| --------------------- | ------------------------------------------------------------------------- |
| `listar_empresas`     | Quais empresas e filas existem, e de que dia a que dia há dados           |
| `tme_por_periodo`     | Tempo médio de espera e de atendimento por dia, semana ou total           |
| `volume_por_hora`     | Mapa de calor: média de atendimentos por dia da semana e hora, e o pico   |
| `csat_por_operador`   | Nota média e % de satisfeitos por operador, com mínimo de respostas       |
| `rechamadas`          | Quantos clientes voltaram dentro da janela, por operador, fila ou empresa |
| `ranking_operadores`  | Ranking por volume, TMA, TME ou CSAT                                      |
| `previsao_volume`     | Volume dos próximos dias pela média do mesmo dia da semana                |
| `atendimento_detalhe` | Um atendimento e os outros contatos do mesmo cliente na semana            |
| `taxa_abandono`       | Abandono por fila, hora, dia ou empresa                                   |
| `comparar_empresas`   | As empresas lado a lado nos principais indicadores                        |

Toda resposta traz o período consultado e a definição do indicador, para o modelo não inventar o que é "TME".

## Rodar localmente

Precisa de Node 22 e Docker.

```bash
git clone https://github.com/jojao115/callcenter-kpi-mcp.git
cd callcenter-kpi-mcp
cp .env.example .env
docker compose run --rm --build seed   # sobe o Postgres e carrega ~54 mil atendimentos fictícios
npm install && npm run build
```

O comando sobe o banco em segundo plano, roda o seed e devolve o terminal; o banco continua no ar (`docker compose down` para parar). O servidor MCP roda por stdio: quem inicia é o cliente. No Claude Desktop, em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "callcenter-kpi": {
      "command": "node",
      "args": ["C:/caminho/para/callcenter-kpi-mcp/dist/main.js"],
      "env": {
        "DATABASE_URL": "postgres://mcp_leitura:leitura_dev@localhost:5433/callcenter"
      }
    }
  }
}
```

Para testar sem cliente nenhum, use o inspetor oficial:

```bash
npx @modelcontextprotocol/inspector node dist/main.js
```

### Comandos

| Comando                              | Faz                                                 |
| ------------------------------------ | --------------------------------------------------- |
| `npm run seed`                       | Recria os dados fictícios (usa `SEED_DATABASE_URL`) |
| `npm run dev`                        | Servidor direto do TypeScript                       |
| `npm test`                           | Testes (sobem um Postgres descartável no Docker)    |
| `npm run lint` / `npm run typecheck` | ESLint e checagem de tipos                          |

Sem Docker, os testes rodam contra qualquer Postgres descartável: `TEST_PG_URL=postgres://usuario:senha@localhost:5432/postgres npm test`.

## Decisões técnicas

- **Ferramentas fechadas em vez de text-to-SQL.** Deixar o LLM escrever SQL é a demo mais rápida e o pior risco: consulta errada que parece certa, tabela inteira no contexto, porta aberta para injeção. Aqui cada pergunta comum vira uma ferramenta com consulta revisada e testada. Partes variáveis do SQL (agrupar por, ordenar por) saem de um mapa fixo escolhido por enum; valores sempre vão como parâmetro.
- **Três camadas de só leitura.** Usuário do Postgres só com `SELECT`, sessão com `default_transaction_read_only` e tempo máximo por consulta. Tem teste que tenta apagar a tabela pelo pool do servidor e confere que o banco recusa.
- **Views materializadas com somas, não médias.** `mv_dia_operador` guarda soma de espera e contagem de atendidos por dia e operador. A média de um mês sai da soma das somas, e não da média das médias, que dá peso igual a um dia de 10 e a um de 500 atendimentos.
- **Fuso explícito.** Todo agrupamento por dia ou hora usa `America/Sao_Paulo`. Um atendimento às 23h30 cai no dia certo, e há teste para isso.
- **Seed determinístico.** Gerador com semente fixa (mulberry32): mesma semente, mesmos 54 mil atendimentos. Os dados seguem padrões de operação (pico de manhã, segunda cheia, abandono que cresce com a espera, cliente que volta depois de nota baixa), para as perguntas terem resposta interessante.
- **Testes contra Postgres de verdade.** Uma base pequena montada à mão confere cada número de cabeça; outra, gerada, passa por todas as ferramentas pelo protocolo MCP. Cada arquivo de teste usa um banco clonado de um modelo, então rodam em paralelo.

## Resultado no projeto real

Versão pública, com dados fictícios, de uma plataforma de indicadores que uso em produção com 8 provedores de internet e cerca de 4 mil atendimentos por semana.

## Próximos passos

- Transporte HTTP (Streamable HTTP) com autenticação por token, para rodar como serviço
- Deploy do banco e do servidor no Railway ou Fly.io, com um cliente de demonstração
- Previsão com tendência e feriados, comparada com a média simples num backtest

## Licença

[MIT](LICENSE). Os dados são gerados por script; nenhuma empresa, pessoa ou atendimento é real.
