#!/bin/sh
set -u

# Vérifie ci-test.sh avec un faux Maestro et un faux xcrun : seul un pilote non prêt est relancé,
# sur un simulateur redémarré, trois essais au plus ; un flow en échec ne l'est jamais.

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"

cat >"$work/bin/xcrun" <<'EOF'
#!/bin/sh
echo "xcrun $*" >>"$FAKE_DIR/calls"
EOF

cat >"$work/bin/maestro" <<'EOF'
#!/bin/sh
echo "maestro $*" >>"$FAKE_DIR/calls"
run=$(grep -c '^maestro' "$FAKE_DIR/calls")
case "$FAKE_MODE" in
  passed) exit 0 ;;
  driver-once) [ "$run" -eq 1 ] && { echo "iOS driver not ready in time"; exit 1; }; exit 0 ;;
  driver-always) echo "iOS driver not ready in time"; exit 1 ;;
  flow-failed) echo "1/3 Flow Failed"; exit 1 ;;
esac
EOF
chmod +x "$work/bin/xcrun" "$work/bin/maestro"

failures=0

expect() {
  mode="$1" status="$2" runs="$3" restarts="$4"
  rm -f "$work/calls"
  FAKE_DIR="$work" FAKE_MODE="$mode" MAESTRO_BIN="$work/bin/maestro" RUNNER_TEMP="$work" \
    PATH="$work/bin:$PATH" "$here/ci-test.sh" SIM flows/ >/dev/null 2>&1
  got_status=$?
  got_runs=$(grep -c '^maestro --device SIM test flows/$' "$work/calls")
  got_restarts=$(grep -c '^xcrun simctl bootstatus SIM -b$' "$work/calls")
  if [ "$got_status" -ne "$status" ] || [ "$got_runs" -ne "$runs" ] || [ "$got_restarts" -ne "$restarts" ]; then
    echo "$mode : attendu statut $status, $runs essais, $restarts redémarrages ;" \
      "obtenu $got_status, $got_runs, $got_restarts." >&2
    failures=$((failures + 1))
  fi
}

expect passed 0 1 0
expect driver-once 0 2 1
expect driver-always 1 3 2
expect flow-failed 1 1 0

[ "$failures" -eq 0 ] && echo "ci-test.sh : 4 cas vérifiés."
exit "$failures"
