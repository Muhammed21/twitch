#!/usr/bin/env bash
set -uo pipefail

# Lance les flows Maestro sur le simulateur $1, pour la CI.
#
# Sur le runner macOS, `xcodebuild test-without-building` reste parfois muet : le pilote XCTest de
# Maestro ne démarre jamais, alors qu'il répond en moins de 40 s quand il démarre. Attendre plus
# longtemps ne change rien (300 s ont échoué comme 120 s). Ce script relance donc Maestro sur un
# simulateur redémarré, et seulement dans ce cas : aucun flow n'a tourné, ce n'est pas un échec de
# l'app. Un flow en échec n'est jamais relancé.
#
# Avec MAESTRO_LIVE_SLUG, la chaîne est publiée en direct par go-live.sh juste avant chaque essai.
# Pendant le redémarrage du simulateur, le runner sature : le serveur RTMP coupe ffmpeg et le live
# se termine. Le ffmpeg de l'essai précédent est donc arrêté, et la nouvelle publication attend que
# la chaîne ne soit plus listée en direct, pour ne pas prendre l'ancien live pour le nouveau.

device="${1:?UDID du simulateur attendu}"
shift
maestro="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
logs="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
max_attempts="${MAESTRO_DRIVER_ATTEMPTS:-3}"
driver_not_ready="iOS driver not ready in time"
live_slug="${MAESTRO_LIVE_SLUG:-}"
go_live="${GO_LIVE_BIN:-$(dirname "$0")/go-live.sh}"
api="${API_BASE_URL:-http://127.0.0.1:3000}"
ffmpeg_pid=""

restart_simulator() {
  pkill -f "maestro-driver-ios-config.xctestrun" || true
  xcrun simctl shutdown "$device" || true
  xcrun simctl boot "$device"
  xcrun simctl bootstatus "$device" -b
}

is_listed_live() {
  curl -fsS "$api/v1/lives" | jq -e --arg slug "$live_slug" '.items[] | select(.slug == $slug)' >/dev/null
}

publish_live() {
  if [ -n "$ffmpeg_pid" ]; then
    kill "$ffmpeg_pid" 2>/dev/null || true
  fi
  local waited=0
  while is_listed_live; do
    if [ "$waited" -ge 60 ]; then
      echo "La chaîne $live_slug est encore listée en direct 60 s après l'arrêt de ffmpeg." >&2
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  if ! ffmpeg_pid=$("$go_live" "$live_slug"); then
    echo "La chaîne $live_slug n'a pas pu être publiée en direct." >&2
    exit 1
  fi
}

attempt=1
while :; do
  if [ -n "$live_slug" ]; then
    publish_live
  fi
  log="$logs/maestro-attempt-$attempt.log"
  "$maestro" --device "$device" test "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  if ! grep -q "$driver_not_ready" "$log"; then
    exit "$status"
  fi
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Le pilote XCTest de Maestro n'a pas démarré en $attempt essais." >&2
    exit "$status"
  fi
  echo "::warning::Pilote XCTest de Maestro non prêt (essai $attempt), simulateur redémarré."
  restart_simulator
  attempt=$((attempt + 1))
done
