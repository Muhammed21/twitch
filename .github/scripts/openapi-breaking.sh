#!/usr/bin/env bash
# Échoue si REVISION casse le contrat /v1 de BASE (ADR 0009, ADR 0024). Usage : openapi-breaking.sh BASE REVISION
set -euo pipefail

OASDIFF_IMAGE="tufin/oasdiff:v1.33.0"
base="$1"
revision="$2"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$base" "$work/base.json"
cp "$revision" "$work/revision.json"

docker run --rm -v "$work":/work:ro "$OASDIFF_IMAGE" \
  breaking /work/base.json /work/revision.json --fail-on ERR --match-path '^/v1'
