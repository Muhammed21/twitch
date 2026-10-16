#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

swiftlint=${SWIFTLINT:-"mint run --no-install --silent --mintfile Mintfile swiftlint"}
rules="unchecked_sendable_justifie suffixe_view_model"

report=$($swiftlint lint --config .swiftlint.yml --reporter json --quiet lint-fixtures/refuse/*.swift lint-fixtures/accepte/*.swift || true)

if ! printf '%s' "$report" | jq -e 'type == "array"' >/dev/null 2>&1; then
  echo "SwiftLint n'a pas rendu de rapport JSON sur les fixtures."
  exit 1
fi

count() {
  printf '%s' "$report" | jq --arg file "$1" --arg rule "$2" \
    '[.[] | select((.file | endswith("/" + $file)) and .rule_id == $rule and .severity == "Error")] | length'
}

failures=0

for path in lint-fixtures/refuse/*.swift; do
  rule=$(basename "$path" | sed 's/--.*//')
  for candidate in $rules; do
    expected=0
    if [ "$candidate" = "$rule" ]; then expected=1; fi
    actual=$(count "$path" "$candidate")
    if [ "$actual" != "$expected" ]; then
      echo "$path : $candidate attendu $expected fois, trouvé $actual fois."
      failures=$((failures + 1))
    fi
  done
done

for path in lint-fixtures/accepte/*.swift; do
  for candidate in $rules; do
    actual=$(count "$path" "$candidate")
    if [ "$actual" != "0" ]; then
      echo "$path : $candidate ne doit pas se déclencher, trouvé $actual fois."
      failures=$((failures + 1))
    fi
  done
done

if [ "$failures" -gt 0 ]; then
  echo "Règles maison SwiftLint : $failures écart(s) sur les fixtures."
  exit 1
fi

echo "Règles maison SwiftLint conformes aux fixtures ($(ls lint-fixtures/refuse lint-fixtures/accepte | grep -c '\.swift$') fixtures)."
