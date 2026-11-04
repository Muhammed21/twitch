#!/usr/bin/env bash
set -uo pipefail

# Lance les flows Maestro sur le simulateur $1, pour la CI.
#
# Sur le runner macOS, `xcodebuild test-without-building` reste parfois muet : le pilote XCTest de
# Maestro ne démarre jamais, alors qu'il répond en moins de 40 s quand il démarre. Attendre plus
# longtemps ne change rien (300 s ont échoué comme 120 s). Ce script relance donc Maestro sur un
# simulateur redémarré, et seulement dans ce cas : aucun flow n'a tourné, ce n'est pas un échec de
# l'app. Un flow en échec n'est jamais relancé.

device="${1:?UDID du simulateur attendu}"
shift
maestro="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
logs="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
max_attempts="${MAESTRO_DRIVER_ATTEMPTS:-3}"
driver_not_ready="iOS driver not ready in time"

restart_simulator() {
  pkill -f "maestro-driver-ios-config.xctestrun" || true
  xcrun simctl shutdown "$device" || true
  xcrun simctl boot "$device"
  xcrun simctl bootstatus "$device" -b
}

attempt=1
while :; do
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
