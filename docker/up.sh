#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
LONG_RUNNING=(postgres redis s3 mailpit)
ONE_SHOT=(db-init s3-init)

if [ ! -f "$ENV_FILE" ]; then
  echo "up.sh : $ENV_FILE introuvable. Copier .env.example en .env." >&2
  exit 1
fi

compose() { docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"; }

compose up -d --wait --wait-timeout 180 "${LONG_RUNNING[@]}"
compose up -d --force-recreate "${ONE_SHOT[@]}"
compose wait "${ONE_SHOT[@]}" >/dev/null

status=0
for service in "${ONE_SHOT[@]}"; do
  code="$(compose ps -a --format '{{.ExitCode}}' "$service")"
  if [ "$code" != "0" ]; then
    echo "up.sh : $service a échoué (code $code)" >&2
    compose logs --no-log-prefix "$service" >&2
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "up.sh : infrastructure prête"
fi
exit "$status"
