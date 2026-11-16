-- Esquema do call center fictício.
-- Todos os horários são timestamptz; os indicadores agrupam por dia e hora de São Paulo.

CREATE TABLE empresas (
  id    smallint PRIMARY KEY,
  nome  text NOT NULL UNIQUE
);

CREATE TABLE filas (
  id          smallint PRIMARY KEY,
  empresa_id  smallint NOT NULL REFERENCES empresas (id),
  nome        text NOT NULL,
  UNIQUE (empresa_id, nome)
);

CREATE TABLE operadores (
  id          integer PRIMARY KEY,
  empresa_id  smallint NOT NULL REFERENCES empresas (id),
  fila_id     smallint NOT NULL REFERENCES filas (id),
  nome        text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true
);

-- Um atendimento abandonado não tem operador, nem atendido_em, nem fim.
CREATE TABLE atendimentos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id   smallint NOT NULL REFERENCES empresas (id),
  fila_id      smallint NOT NULL REFERENCES filas (id),
  operador_id  integer REFERENCES operadores (id),
  cliente_id   integer NOT NULL,
  canal        text NOT NULL CHECK (canal IN ('chat', 'whatsapp', 'telefone')),
  motivo       text NOT NULL,
  status       text NOT NULL CHECK (status IN ('finalizado', 'abandonado')),
  inicio       timestamptz NOT NULL,
  atendido_em  timestamptz,
  fim          timestamptz,
  csat         smallint CHECK (csat BETWEEN 1 AND 5),
  CHECK (
    (status = 'finalizado' AND operador_id IS NOT NULL
      AND atendido_em IS NOT NULL AND fim IS NOT NULL
      AND atendido_em >= inicio AND fim >= atendido_em)
    OR
    (status = 'abandonado' AND operador_id IS NULL AND atendido_em IS NULL AND fim IS NULL AND csat IS NULL)
  )
);

CREATE INDEX atendimentos_inicio_idx ON atendimentos (inicio);
CREATE INDEX atendimentos_cliente_idx ON atendimentos (empresa_id, cliente_id, inicio);
CREATE INDEX atendimentos_operador_idx ON atendimentos (operador_id, inicio);

-- Indicadores por dia, fila e operador. Os abandonos ficam com operador_id nulo.
-- Guarda somas e contagens, não médias, para a média de vários dias sair certa.
CREATE MATERIALIZED VIEW mv_dia_operador AS
SELECT
  a.empresa_id,
  a.fila_id,
  a.operador_id,
  (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date                          AS dia,
  count(*)::int                                                               AS volume,
  count(*) FILTER (WHERE a.status = 'finalizado')::int                        AS atendidos,
  count(*) FILTER (WHERE a.status = 'abandonado')::int                        AS abandonos,
  coalesce(sum(extract(epoch FROM a.atendido_em - a.inicio)), 0)::bigint      AS espera_seg,
  coalesce(sum(extract(epoch FROM a.fim - a.atendido_em)), 0)::bigint         AS duracao_seg,
  coalesce(sum(a.csat), 0)::int                                               AS csat_soma,
  count(a.csat)::int                                                          AS csat_respostas,
  count(*) FILTER (WHERE a.csat >= 4)::int                                    AS csat_satisfeitos
FROM atendimentos a
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX mv_dia_operador_uk
  ON mv_dia_operador (empresa_id, fila_id, coalesce(operador_id, 0), dia);

-- Volume por dia e hora, para o mapa de calor e a taxa de abandono por hora.
CREATE MATERIALIZED VIEW mv_hora AS
SELECT
  a.empresa_id,
  a.fila_id,
  (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date                   AS dia,
  extract(hour FROM a.inicio AT TIME ZONE 'America/Sao_Paulo')::int    AS hora,
  count(*)::int                                                        AS volume,
  count(*) FILTER (WHERE a.status = 'abandonado')::int                 AS abandonos
FROM atendimentos a
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX mv_hora_uk ON mv_hora (empresa_id, fila_id, dia, hora);
