#!/bin/sh
set -u

# Vérifie ci-test.sh avec un faux Maestro, un faux xcrun, un faux go-live.sh et une fausse API :
# seul un pilote non prêt est relancé, sur un simulateur redémarré, trois essais au plus ; un flow
# en échec ne l'est jamais. Avant chaque essai, le live est publié à nouveau : le ffmpeg de l'essai
# précédent est arrêté, et la chaîne ne doit plus être listée en direct avant la nouvelle publication.

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'pkill -f "$work/bin/fake-ffmpeg" 2>/dev/null; rm -rf "$work"' EXIT
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

cat >"$work/bin/fake-ffmpeg" <<'EOF'
#!/bin/sh
trap 'rm -f "$FAKE_DIR/listed"; exit 0' TERM
touch "$FAKE_DIR/listed"
while :; do sleep 1; done
EOF

cat >"$work/bin/go-live" <<'EOF'
#!/bin/sh
if [ -e "$FAKE_DIR/listed" ]; then
  echo "go-live sur un live encore listé" >>"$FAKE_DIR/calls"
fi
echo "go-live $*" >>"$FAKE_DIR/calls"
[ "$FAKE_LIVE" = "refused" ] && exit 1
"$FAKE_DIR/bin/fake-ffmpeg" >/dev/null 2>&1 &
echo $!
EOF

cat >"$work/bin/curl" <<'EOF'
#!/bin/sh
if [ -e "$FAKE_DIR/listed" ]; then
  echo '{"items":[{"slug":"viewer_dev"}]}'
else
  echo '{"items":[]}'
fi
EOF
chmod +x "$work/bin/xcrun" "$work/bin/maestro" "$work/bin/fake-ffmpeg" "$work/bin/go-live" "$work/bin/curl"

failures=0

expect() {
  mode="$1" live="$2" status="$3" runs="$4" restarts="$5" publications="$6"
  rm -f "$work/calls" "$work/listed"
  FAKE_DIR="$work" FAKE_MODE="$mode" FAKE_LIVE="$live" MAESTRO_BIN="$work/bin/maestro" RUNNER_TEMP="$work" \
    MAESTRO_LIVE_SLUG=viewer_dev GO_LIVE_BIN="$work/bin/go-live" PATH="$work/bin:$PATH" \
    "$here/ci-test.sh" SIM flows/ >/dev/null 2>&1
  got_status=$?
  pkill -f "$work/bin/fake-ffmpeg" 2>/dev/null
  got_runs=$(grep -c '^maestro --device SIM test flows/$' "$work/calls")
  got_restarts=$(grep -c '^xcrun simctl bootstatus SIM -b$' "$work/calls")
  got_publications=$(grep -c '^go-live viewer_dev$' "$work/calls")
  got_order=$(grep -E '^(go-live|maestro)' "$work/calls" | cut -d' ' -f1 | paste -sd' ' -)
  want_order=$(
    i=0
    while [ "$i" -lt "$runs" ]; do
      printf 'go-live maestro '
      i=$((i + 1))
    done | sed 's/ $//'
  )
  if [ "$runs" -eq 0 ]; then want_order="go-live"; fi
  stale=$(grep -c 'encore listé' "$work/calls")
  if [ "$got_status" -ne "$status" ] || [ "$got_runs" -ne "$runs" ] || [ "$got_restarts" -ne "$restarts" ] ||
    [ "$got_publications" -ne "$publications" ] || [ "$got_order" != "$want_order" ] || [ "$stale" -ne 0 ]; then
    echo "$mode ($live) : attendu statut $status, $runs essais, $restarts redémarrages, $publications publications" \
      "($want_order) ; obtenu $got_status, $got_runs, $got_restarts, $got_publications ($got_order)," \
      "$stale publications sur un live encore listé." >&2
    failures=$((failures + 1))
  fi
}

expect passed published 0 1 0 1
expect driver-once published 0 2 1 2
expect driver-always published 1 3 2 3
expect flow-failed published 1 1 0 1
expect passed refused 1 0 0 1

[ "$failures" -eq 0 ] && echo "ci-test.sh : 5 cas vérifiés."
exit "$failures"
