#!/bin/sh
# Cria o usuário só de leitura que o servidor MCP usa.
# Roda uma vez, na primeira subida do container do Postgres.
set -eu

: "${MCP_DB_USER:=mcp_leitura}"
: "${MCP_DB_PASSWORD:?defina MCP_DB_PASSWORD no .env}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v usuario="$MCP_DB_USER" \
  -v senha="$MCP_DB_PASSWORD" <<'SQL'
CREATE ROLE :"usuario" LOGIN PASSWORD :'senha';
GRANT CONNECT ON DATABASE :"DBNAME" TO :"usuario";
GRANT USAGE ON SCHEMA public TO :"usuario";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"usuario";
ALTER ROLE :"usuario" SET default_transaction_read_only = on;
ALTER ROLE :"usuario" SET statement_timeout = '5s';
SQL
