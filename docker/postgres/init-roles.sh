#!/bin/sh
set -eu

run() {
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U postgres -d postgres "$@"
}

ensure_role() {
  role="$1"
  password="$2"
  attributes="$3"
  run -q -v role="$role" -v password="$password" -v attributes="$attributes" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEROLE %s PASSWORD %L', :'role', :'attributes', :'password') \gexec
SQL
}

ensure_database() {
  database="$1"
  owner="$2"
  run -q -v database="$database" -v owner="$owner" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'owner') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'database') \gexec
SQL
}

grant_connect() {
  database="$1"
  role="$2"
  run -q -v database="$database" -v role="$role" <<'SQL'
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role') \gexec
SQL
}

ensure_role migrator "$PG_PASSWORD_MIGRATOR" CREATEDB
for context in identity channel stream chat moderation discovery monetization notification; do
  variable="PG_PASSWORD_APP_$(echo "$context" | tr '[:lower:]' '[:upper:]')"
  eval "password=\${$variable}"
  ensure_role "app_$context" "$password" NOCREATEDB
done
ensure_role app_outbox_relay "$PG_PASSWORD_APP_OUTBOX_RELAY" NOCREATEDB
ensure_role app_health "$PG_PASSWORD_APP_HEALTH" NOCREATEDB
ensure_role payload "$PG_PASSWORD_PAYLOAD" NOCREATEDB

ensure_database app migrator
ensure_database payload payload

for role in migrator app_identity app_channel app_stream app_chat app_moderation app_discovery app_monetization app_notification app_outbox_relay app_health; do
  grant_connect app "$role"
done
grant_connect payload payload

echo "db-init : rôles et bases à jour"
