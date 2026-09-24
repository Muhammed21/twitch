#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/.env.example"
export COMPOSE_PROJECT_NAME="twitch-infra-test"
compose() { docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}
check_not() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then fail "$label"; else pass "$label"; fi
}

psql_as() {
  local role="$1" password="$2" database="$3" sql="$4"
  compose exec -T -e PGPASSWORD="$password" postgres \
    psql -h 127.0.0.1 -U "$role" -d "$database" -v ON_ERROR_STOP=1 -tAc "$sql"
}
psql_admin() { psql_as postgres "$POSTGRES_PASSWORD" app "$1"; }

cleanup() { compose down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT
cleanup

echo "Démarrage de l'infrastructure"
check "docker/up.sh : services sains, db-init et s3-init terminés avec succès" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"
check_not "docker/up.sh échoue si db-init échoue (mauvais mot de passe)" env ENV_FILE="$ENV_FILE" POSTGRES_PASSWORD=wrong "$ROOT/docker/up.sh"
check "docker/up.sh relancé avec la bonne configuration réussit" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"

echo "Rôles et bases"
ROLES="migrator app_identity app_channel app_stream app_chat app_moderation app_discovery app_monetization app_notification app_outbox_relay app_health payload"
for role in $ROLES; do
  check "le rôle $role existe" test "$(psql_admin "SELECT count(*) FROM pg_roles WHERE rolname = '$role' AND rolcanlogin")" = "1"
done
check "migrator est propriétaire de la base app" test "$(psql_admin "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'app'")" = "migrator"
check "migrator a CREATEDB (shadow database)" test "$(psql_admin "SELECT rolcreatedb FROM pg_roles WHERE rolname = 'migrator'")" = "t"
check "payload est propriétaire de la base payload" test "$(psql_admin "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'payload'")" = "payload"
check "aucun rôle applicatif n'est superutilisateur" test "$(psql_admin "SELECT count(*) FROM pg_roles WHERE rolsuper AND rolname <> 'postgres'")" = "0"
check "db-init ne crée aucun schéma applicatif dans app" test "$(psql_admin "SELECT count(*) FROM pg_namespace WHERE nspname IN ('identity','channel','stream','chat','moderation','discovery','monetization','notification','authz','audit','cms')")" = "0"

echo "Cloisonnement des bases"
check "app_channel se connecte à app" psql_as app_channel "$PG_PASSWORD_APP_CHANNEL" app "SELECT 1"
check_not "app_channel ne se connecte pas à payload" psql_as app_channel "$PG_PASSWORD_APP_CHANNEL" payload "SELECT 1"
check "payload se connecte à payload" psql_as payload "$PG_PASSWORD_PAYLOAD" payload "SELECT 1"
check_not "payload ne se connecte pas à app" psql_as payload "$PG_PASSWORD_PAYLOAD" app "SELECT 1"
check "migrator se connecte à app" psql_as migrator "$PG_PASSWORD_MIGRATOR" app "SELECT 1"
check_not "migrator ne se connecte pas à payload" psql_as migrator "$PG_PASSWORD_MIGRATOR" payload "SELECT 1"

echo "Idempotence de db-init"
check "db-init relancé une première fois réussit" compose run --rm db-init
check "db-init relancé une seconde fois réussit" compose run --rm db-init
check "toujours exactement un rôle migrator" test "$(psql_admin "SELECT count(*) FROM pg_roles WHERE rolname = 'migrator'")" = "1"

echo "Redis"
check "redis répond PONG" test "$(compose exec -T redis redis-cli ping)" = "PONG"

echo "Stockage S3"
S3_URL="http://127.0.0.1:${S3_PORT}"
SIGV4="aws:amz:${S3_REGION}:s3"
TMP="$(mktemp)"
echo "contenu de test" >"$TMP"
check "écriture authentifiée dans le bucket" curl -sf --aws-sigv4 "$SIGV4" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -T "$TMP" "$S3_URL/$S3_BUCKET/infra-test.txt"
check "relecture authentifiée identique" test "$(curl -sf --aws-sigv4 "$SIGV4" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" "$S3_URL/$S3_BUCKET/infra-test.txt")" = "contenu de test"
check_not "lecture anonyme refusée" curl -sf "$S3_URL/$S3_BUCKET/infra-test.txt"
rm -f "$TMP"

echo "Mailpit"
MAIL="$(mktemp)"
printf 'From: test@twitch.local\r\nTo: user@twitch.local\r\nSubject: infra-test\r\n\r\nbonjour\r\n' >"$MAIL"
check "envoi SMTP accepté" curl -sf "smtp://127.0.0.1:${MAILPIT_SMTP_PORT}" --mail-from test@twitch.local --mail-rcpt user@twitch.local -T "$MAIL"
check "message visible dans l'API de Mailpit" sh -c "curl -sf 'http://127.0.0.1:${MAILPIT_UI_PORT}/api/v1/messages' | grep -q infra-test"
rm -f "$MAIL"

echo "Ports publiés sur 127.0.0.1 uniquement"
published="$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --format '{{.Ports}}' | tr ',' '\n' | grep -- '->' || true)"
check "au moins un port publié" test -n "$published"
check_not "aucun port publié sur 0.0.0.0 ou ::" sh -c "printf '%s\n' \"$published\" | grep -Eq '0\.0\.0\.0:|\[::\]:|:::'"

echo
if [ "$failures" -eq 0 ]; then
  echo "Infrastructure : tous les tests passent"
  exit 0
fi
echo "Infrastructure : $failures échec(s)"
exit 1
