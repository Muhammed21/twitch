#!/bin/sh
set -eu

packages="$(cd "$(dirname "$0")/../Packages" && pwd)"
sources="$packages/Core/Networking/Sources"
input="${1:-$sources/openapi.json}"
document="$(cd "$(dirname "$input")" && pwd)/$(basename "$input")"
generator="$packages/.build/checkouts/swift-openapi-generator"

swift package --package-path "$packages" resolve >/dev/null
swift build --package-path "$generator" --configuration release --product swift-openapi-generator >/dev/null

output="$(mktemp -d)"
trap 'rm -rf "$output"' EXIT

status=0
log="$(swift run --skip-build --package-path "$generator" --configuration release swift-openapi-generator generate \
  --config "$sources/openapi-generator-config.yaml" --output-directory "$output" "$document" 2>&1)" || status=$?
printf '%s\n' "$log"

if [ "$status" -ne 0 ]; then
  echo "Le générateur Swift a échoué sur $document."
  exit "$status"
fi

if printf '%s' "$log" | grep -qE "is not supported|skipping"; then
  echo "Le générateur Swift a sauté une partie du contrat : simplifiez le schéma, ne patchez pas le code généré (ADR 0024, §8)."
  exit 1
fi

echo "Le générateur Swift a traduit tout le contrat filtré de $document."
