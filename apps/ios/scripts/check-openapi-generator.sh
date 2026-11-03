#!/bin/sh
set -eu

packages="$(cd "$(dirname "$0")/../Packages" && pwd)"
sources="$packages/Core/Networking/Sources"
input="${1:-$sources/openapi.json}"
document="$(cd "$(dirname "$input")" && pwd)/$(basename "$input")"
generator="$packages/.build/checkouts/swift-openapi-generator"
configs="$sources/openapi-generator-config.yaml"
if [ "$#" -eq 0 ]; then
  configs="$(ls "$packages"/Core/*/Sources/openapi-generator-config.yaml)"
fi

swift package --package-path "$packages" resolve >/dev/null
swift build --package-path "$generator" --configuration release --product swift-openapi-generator >/dev/null

output="$(mktemp -d)"
trap 'rm -rf "$output"' EXIT

for config in $configs; do
  status=0
  log="$(swift run --skip-build --package-path "$generator" --configuration release swift-openapi-generator generate \
    --config "$config" --output-directory "$output" "$document" 2>&1)" || status=$?
  printf '%s\n' "$log"

  if [ "$status" -ne 0 ]; then
    echo "Le générateur Swift a échoué sur $document avec $config."
    exit "$status"
  fi

  if printf '%s' "$log" | grep -qE "is not supported|skipping"; then
    echo "Le générateur Swift a sauté une partie du contrat : simplifiez le schéma, ne patchez pas le code généré (ADR 0024, §8)."
    exit 1
  fi

  rm -rf "${output:?}"/*
  echo "Le générateur Swift a traduit tout le contrat filtré de $document avec $config."
done
