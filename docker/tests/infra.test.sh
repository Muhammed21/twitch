#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.example}"
export COMPOSE_PROJECT_NAME="${INFRA_TEST_PROJECT:-twitch-infra-test}"
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

cleanup() { compose --profile full down -v --remove-orphans >/dev/null 2>&1; }
trap cleanup EXIT
cleanup

echo "Démarrage de l'infrastructure"
check "docker/up.sh : services sains, db-init et s3-init terminés avec succès" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"
check_not "docker/up.sh échoue si db-init échoue (mauvais mot de passe)" env ENV_FILE="$ENV_FILE" POSTGRES_PASSWORD=wrong "$ROOT/docker/up.sh"
check "docker/up.sh relancé avec la bonne configuration réussit" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"

echo "Rôles et bases"
ROLES="migrator app_identity app_channel app_stream app_chat app_moderation app_discovery app_monetization app_notification app_video app_outbox_relay app_projection_rebuild app_health payload"
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
denied_on_app() {
  local output
  output="$(psql_as "$1" "$2" app "SELECT 1" 2>&1)"
  grep -q 'permission denied for database "app"' <<<"$output"
}
check "payload est refusé sur app pour droit insuffisant (42501), pas pour une autre cause" denied_on_app payload "$PG_PASSWORD_PAYLOAD"
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
check "écriture authentifiée d'une image servie" curl -sf --aws-sigv4 "$SIGV4" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -T "$TMP" "$S3_URL/$S3_BUCKET/images/infra-test.webp"
check "lecture anonyme autorisée sous images/" test "$(curl -sf "$S3_URL/$S3_BUCKET/images/infra-test.webp")" = "contenu de test"
check_not "écriture anonyme refusée sous images/" curl -sf -T "$TMP" "$S3_URL/$S3_BUCKET/images/anonyme.webp"
check_not "listage anonyme refusé" curl -sf "$S3_URL/$S3_BUCKET/?list-type=2&prefix=images/"
incoming_ttl() {
  echo fs.configure | compose exec -T s3 weed shell -master=localhost:9333 |
    grep -A3 "\"/buckets/$S3_BUCKET/incoming/\"" | grep -q '"ttl": *"1d"'
}
check "dépôts sous incoming/ effacés au bout d'un jour" incoming_ttl
rm -f "$TMP"

echo "Mailpit"
MAIL="$(mktemp)"
printf 'From: test@twitch.local\r\nTo: user@twitch.local\r\nSubject: infra-test\r\n\r\nbonjour\r\n' >"$MAIL"
check "envoi SMTP accepté" curl -sf "smtp://127.0.0.1:${MAILPIT_SMTP_PORT}" --mail-from test@twitch.local --mail-rcpt user@twitch.local -T "$MAIL"
check "message visible dans l'API de Mailpit" sh -c "curl -sf 'http://127.0.0.1:${MAILPIT_UI_PORT}/api/v1/messages' | grep -q infra-test"
rm -f "$MAIL"

echo "Job de migration (profil full)"
migrate() { compose --profile full run --rm --build migrate; }
migrate_alone() { compose --profile full run --rm --build --no-deps migrate; }
applied_migrations() { psql_admin "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"; }
psql_admin "REVOKE CONNECT ON DATABASE app FROM app_video; DROP ROLE app_video" >/dev/null 2>&1
check_not "migrate échoue si un rôle attendu manque" migrate_alone
check "la base n'est pas touchée quand un rôle manque" test "$(psql_admin "SELECT to_regclass('public._prisma_migrations') IS NULL")" = "t"
check "db-init relancé recrée le rôle manquant" env ENV_FILE="$ENV_FILE" "$ROOT/docker/up.sh"
check "migrate applique les migrations sur une base neuve" migrate
check "les 11 schémas existent après migrate" test "$(psql_admin "SELECT count(*) FROM pg_namespace WHERE nspname IN ('identity','channel','stream','chat','moderation','discovery','monetization','notification','video','authz','audit')")" = "11"
payload_schemas() { psql_admin "SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname NOT IN ('information_schema', 'public') AND (has_schema_privilege('payload', oid, 'USAGE') OR has_schema_privilege('payload', oid, 'CREATE'))"; }
check "payload n'a aucun droit sur les schémas de app après migrate" test "$(payload_schemas)" = "0"
applied="$(applied_migrations)"
check "au moins une migration appliquée" test "$applied" -ge 1
check "migrate rejoué réussit" migrate
check "migrate rejoué n'applique rien de plus" test "$(applied_migrations)" = "$applied"

echo "API et relais de l'outbox (profil full)"
full() { compose --profile full "$@"; }
container_of() { full ps -a -q "$1"; }
state_of() { docker inspect -f "{{.State.$2}}" "$(container_of "$1")"; }
comparable_time() {
  local time="${1%Z}" fraction=""
  case "$time" in *.*) fraction="${time#*.}" time="${time%%.*}" ;; esac
  printf '%s.%s' "$time" "$(printf '%-9s' "$fraction" | tr ' ' 0)"
}
started_after_migrate() { test "$(comparable_time "$(state_of "$1" StartedAt)")" \> "$(comparable_time "$(state_of migrate FinishedAt)")"; }
in_api() { full exec -T api "$@"; }
stopped_by_itself() {
  case "$(state_of "$1" ExitCode)" in
    0 | 143) return 0 ;;
    *) return 1 ;;
  esac
}
up_with_failing_migrate() {
  compose -f "$ROOT/compose.yaml" -f "$ROOT/docker/tests/compose.failing-migrate.yaml" \
    --profile full up -d --wait --wait-timeout 120 api
}
check "démarrer api démarre aussi outbox-relay, l'API devient saine" full up -d --build --wait --wait-timeout 600 api
check "/health/ready de l'API répond 200 depuis l'hôte" curl -sf "http://127.0.0.1:${API_PORT:-3000}/health/ready"
check "l'API démarre après la fin de migrate" started_after_migrate api
check "l'API joint le plan de contrôle de video à VIDEO_SERVICE_URL" in_api node -e 'fetch(process.env.VIDEO_SERVICE_URL + "/health/ready").then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))'
check "le relais démarre avec l'API, sans être nommé" test -n "$(container_of outbox-relay)"
check "le relais démarre après la fin de migrate" started_after_migrate outbox-relay
check "le relais tourne" test "$(state_of outbox-relay Running)" = "true"
check "l'API tourne sous l'utilisateur node" test "$(in_api id -un)" = "node"
check "l'image de l'API ne contient pas les migrations" in_api sh -c '! test -e /repo/packages/db/prisma/migrations'
check "l'image de l'API ne contient pas le CLI Prisma" in_api sh -c '! ls -d /repo/node_modules/.pnpm/prisma@* 2>/dev/null'
check "SIGTERM arrête l'API et le relais dans le délai de grâce" full stop api outbox-relay
check "l'API s'est arrêtée d'elle-même, sans SIGKILL" stopped_by_itself api
check "le relais s'est arrêté de lui-même, sans SIGKILL" stopped_by_itself outbox-relay
full rm -sf api outbox-relay >/dev/null 2>&1
check_not "l'API ne démarre pas si migrate échoue" up_with_failing_migrate
check "l'API a été créée mais jamais démarrée" test "$(state_of api Status)" = "created"

echo "Service vidéo (profil full)"
VIDEO_HTTP="http://127.0.0.1:${VIDEO_HTTP_PORT}"
VIDEO_AUTH="authorization: Bearer ${VIDEO_SERVICE_SECRET}"
EXTERNAL_ID="0b6f3c2e-5d1a-4e8b-9f4c-2a7d6e1b3c90"
in_video() { full exec -T video "$@"; }
video_api() { curl -sf -H "$VIDEO_AUTH" -H "content-type: application/json" "$@"; }
until_ok() {
  for _ in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  return 1
}
hls_path() { curl -sf "$VIDEO_HTTP/hls/channels/$1/master.m3u8" | grep 'm3u8$'; }
has_segments() { curl -sf "$VIDEO_HTTP$(hls_path "$1")" | grep -q '^#EXTINF'; }
publish_from_host() {
  ffmpeg -hide_banner -loglevel error -re \
    -f lavfi -i "testsrc2=size=320x180:rate=30" -f lavfi -i "sine=frequency=440:sample_rate=44100" \
    -t 8 -c:v libx264 -preset ultrafast -tune zerolatency -g 60 -keyint_min 60 -sc_threshold 0 \
    -c:a aac -f flv "rtmp://127.0.0.1:${VIDEO_RTMP_PORT}/live/$1"
}
full rm -sf video >/dev/null 2>&1
check "video démarre et devient sain" full up -d --build --wait --wait-timeout 600 video
check "/health/ready de video répond 200 depuis l'hôte" curl -sf "$VIDEO_HTTP/health/ready"
check "video démarre après la fin de migrate" started_after_migrate video
check "video tourne sous l'utilisateur node" test "$(in_video id -un)" = "node"
check "l'image de video contient ffmpeg" in_video ffmpeg -version
check "l'image de video ne contient pas les migrations" in_video sh -c '! test -e /repo/packages/db/prisma/migrations'
channel_id="$(video_api -X POST -d "{\"externalId\":\"$EXTERNAL_ID\"}" "$VIDEO_HTTP/channels" | jq -r .id)"
stream_key="$(video_api "$VIDEO_HTTP/channels/$channel_id/stream-key" | jq -r .streamKey)"
check "le plan de contrôle crée un canal et sa clé de stream" test -n "$stream_key" -a "$stream_key" != null
publish_from_host "$stream_key" >/dev/null 2>&1 &
publisher=$!
check "une publication ffmpeg depuis l'hôte ouvre la playlist maître du canal" until_ok hls_path "$channel_id"
check "la playlist de média du canal annonce des segments" until_ok has_segments "$channel_id"
check "ffmpeg publie jusqu'au bout sans erreur" wait "$publisher"
check "SIGTERM arrête video dans le délai de grâce" full stop video
check "video s'est arrêté de lui-même, sans SIGKILL" stopped_by_itself video
full rm -sf video >/dev/null 2>&1

echo "Chat (profil full)"
CHAT_HTTP="http://127.0.0.1:${CHAT_HTTP_PORT}"
in_chat() { full exec -T chat "$@"; }
started_after_api() { test "$(comparable_time "$(state_of chat StartedAt)")" \> "$(comparable_time "$(state_of api StartedAt)")"; }
upgrade_status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 5 --http1.1 \
    -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "$@" "$CHAT_HTTP/socket.io/?EIO=4&transport=websocket"
}
check "chat démarre après l'API et devient sain" full up -d --build --wait --wait-timeout 600 chat
check "/health/ready du chat répond 200 depuis l'hôte" curl -sf "$CHAT_HTTP/health/ready"
check "le chat démarre après l'API" started_after_api
check "le chat tourne sous l'utilisateur node" test "$(in_chat id -un)" = "node"
check "le chat lit le JWKS de l'API à CHAT_API_JWKS_URL" in_chat node -e 'fetch(process.env.CHAT_API_JWKS_URL).then(r => r.json()).then(b => process.exit(b.keys.length > 0 ? 0 : 1), () => process.exit(1))'
check "un upgrade sans jeton reçoit 401 depuis l'hôte" test "$(upgrade_status)" = "401"
check "un upgrade au jeton invalide reçoit 401 depuis l'hôte" test "$(upgrade_status -H "authorization: Bearer invalide")" = "401"
check "SIGTERM arrête le chat dans le délai de grâce" full stop chat
check "le chat s'est arrêté de lui-même, sans SIGKILL" stopped_by_itself chat
full rm -sf chat >/dev/null 2>&1

echo "Payload (profil full)"
PAYLOAD_HTTP="http://127.0.0.1:${PAYLOAD_PORT}"
in_payload() { full exec -T payload "$@"; }
started_after_payload_migrate() { test "$(comparable_time "$(state_of payload StartedAt)")" \> "$(comparable_time "$(state_of payload-migrate FinishedAt)")"; }
up_payload_with_failing_migrate() {
  compose -f "$ROOT/compose.yaml" -f "$ROOT/docker/tests/compose.failing-payload-migrate.yaml" \
    --profile full up -d --build --wait --wait-timeout 600 payload
}
payload_migrations() { psql_as payload "$PG_PASSWORD_PAYLOAD" payload "SELECT count(*) FROM payload_migrations WHERE batch > 0"; }
check_not "payload ne démarre pas si payload-migrate échoue" up_payload_with_failing_migrate
check "payload a été créé mais jamais démarré" test "$(state_of payload Status)" = "created"
check "aucune migration de Payload n'est appliquée" test "$(psql_as payload "$PG_PASSWORD_PAYLOAD" payload "SELECT to_regclass('public.payload_migrations') IS NULL")" = "t"
full rm -sf payload payload-migrate >/dev/null 2>&1
check "payload démarre après payload-migrate et une API saine, et devient sain" full up -d --build --wait --wait-timeout 600 payload
if [ "$(state_of payload Running 2>/dev/null)" != "true" ]; then full logs --no-color --tail 80 payload-migrate payload; fi
check "/health/ready de Payload répond 200 depuis l'hôte" curl -sf "$PAYLOAD_HTTP/health/ready"
check "/health/live de Payload répond 200 depuis l'hôte" curl -sf "$PAYLOAD_HTTP/health/live"
check "l'admin de Payload répond depuis l'hôte" curl -sf -o /dev/null "$PAYLOAD_HTTP/admin/login"
check "payload démarre après la fin de payload-migrate" started_after_payload_migrate
check "payload-migrate a appliqué les migrations de Payload" test "$(payload_migrations)" -ge 1
check "payload tourne sous l'utilisateur node" test "$(in_payload id -un)" = "node"
check "l'image de payload ne contient pas les migrations" in_payload sh -c '! test -e /repo/apps/payload/src/migrations'
check "SIGTERM arrête payload dans le délai de grâce" full stop payload
check "payload s'est arrêté de lui-même, sans SIGKILL" stopped_by_itself payload
full rm -sf payload payload-migrate >/dev/null 2>&1

echo "Exposition sur le réseau local (compose.lan.yaml)"
host_ips() {
  local service="$1"
  shift
  compose "$@" --profile full config --format json |
    jq -r --arg service "$service" '.services[$service].ports[] | "\(.host_ip // "*"):\(.published)"' |
    sort | tr '\n' ' '
}
lan_host_ips() { host_ips "$1" -f "$ROOT/compose.yaml" -f "$ROOT/compose.lan.yaml"; }
check "sans compose.lan.yaml, video publie RTMP et HLS sur 127.0.0.1" test "$(host_ips video)" = "127.0.0.1:${VIDEO_RTMP_PORT} 127.0.0.1:${VIDEO_HTTP_PORT} "
check "compose.lan.yaml republie l'API sur toutes les interfaces" test "$(lan_host_ips api)" = "*:${API_PORT} "
check "compose.lan.yaml republie RTMP et HLS de video sur toutes les interfaces" test "$(lan_host_ips video)" = "*:${VIDEO_RTMP_PORT} *:${VIDEO_HTTP_PORT} "
check "sans compose.lan.yaml, le chat publie sur 127.0.0.1" test "$(host_ips chat)" = "127.0.0.1:${CHAT_HTTP_PORT} "
check "compose.lan.yaml republie le chat sur toutes les interfaces" test "$(lan_host_ips chat)" = "*:${CHAT_HTTP_PORT} "
check "compose.lan.yaml laisse PostgreSQL sur 127.0.0.1" test "$(lan_host_ips postgres)" = "127.0.0.1:${POSTGRES_PORT} "
check "sans compose.lan.yaml, payload publie sur 127.0.0.1" test "$(host_ips payload)" = "127.0.0.1:${PAYLOAD_PORT} "
check "compose.lan.yaml laisse payload sur 127.0.0.1" test "$(lan_host_ips payload)" = "127.0.0.1:${PAYLOAD_PORT} "

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
