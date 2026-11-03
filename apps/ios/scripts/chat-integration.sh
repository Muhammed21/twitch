#!/bin/sh
set -eu

root="$(cd "$(dirname "$0")/../../.." && pwd)"
destination="${1:?Destination xcodebuild attendue, par exemple id=<UDID du simulateur>}"
shift

fixture="$(mktemp)"
node "$root/apps/chat/src/transport/testing/ios-fixture.ts" >"$fixture" &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -f "$fixture"' EXIT

until [ "$(wc -l <"$fixture")" -ge 5 ]; do
  if ! kill -0 "$server" 2>/dev/null; then
    echo "Le serveur de chat de test n'a pas démarré." >&2
    exit 1
  fi
  sleep 1
done

while IFS='=' read -r name value; do
  export "TEST_RUNNER_$name=$value"
done <"$fixture"

cd "$root/apps/ios/Packages"
xcodebuild test -skipPackagePluginValidation -scheme Packages-Package -destination "$destination" \
  -only-testing:ChatTransportTests/ChatIntegrationTests "$@"
