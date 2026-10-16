#!/bin/sh
set -eu

if ! command -v mint >/dev/null 2>&1; then
  echo "SwiftFormat passe par Mint, absent de cette machine. Installez-le : brew install mint && mint bootstrap --mintfile apps/ios/Mintfile (README, section iOS)." >&2
  exit 1
fi

exec mint run --no-install --silent --mintfile "$(dirname "$0")/../Mintfile" swiftformat "$@"
