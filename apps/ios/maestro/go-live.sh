#!/bin/sh
set -eu

# Met une chaîne en direct pour les flows Maestro : mire et sinusoïde de ffmpeg publiées en RTMP
# avec la clé de stream lue au plan de contrôle du service vidéo. Attend d'abord que l'API ait lié
# la chaîne à son canal vidéo (stream.StreamChannel) : sans ce lien, le webhook de début de live
# est ignoré. Rend la main une fois le live listé par l'API ; ffmpeg continue en arrière-plan, son
# PID est écrit sur la sortie standard.

slug="${1:?Slug de la chaîne attendu, par exemple viewer_dev}"
api="${API_BASE_URL:-http://127.0.0.1:3000}"
video="${VIDEO_SERVICE_URL:-http://127.0.0.1:3002}"
secret="${VIDEO_SERVICE_SECRET:?VIDEO_SERVICE_SECRET attendu}"
database="${DATABASE_URL_STREAM:?DATABASE_URL_STREAM attendu}"

wait_for() {
  description="$1"
  shift
  attempts=0
  until "$@"; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      echo "$description après 60 s." >&2
      exit 1
    fi
    sleep 1
  done
}

has_channel() {
  channel_id=$(curl -fsS "$api/v1/channels/$slug" 2>/dev/null | jq -r .id) && [ -n "$channel_id" ]
}
wait_for "La chaîne $slug n'existe pas" has_channel

has_provider() {
  provider_id=$(echo 'SELECT "providerChannelId" FROM stream."StreamChannel" WHERE "channelId" = :'"'"'channel'"'"';' \
    | psql "$database" -tA -v channel="$channel_id") && [ -n "$provider_id" ]
}
wait_for "La chaîne $slug n'est pas liée à un canal vidéo" has_provider

credentials=$(curl -fsS "$video/channels/$provider_id/stream-key" -H "authorization: Bearer $secret")
ingest="$(echo "$credentials" | jq -r .ingestUrl)/$(echo "$credentials" | jq -r .streamKey)"

ffmpeg -nostdin -loglevel error -re \
  -f lavfi -i testsrc2=size=640x360:rate=30 -f lavfi -i sine=frequency=440 \
  -c:v libx264 -preset veryfast -g 60 -c:a aac -f flv "$ingest" >/dev/null 2>&1 &
echo $!

is_live() {
  curl -fsS "$api/v1/lives" | jq -e --arg slug "$slug" '.items[] | select(.slug == $slug)' >/dev/null
}
wait_for "La chaîne $slug n'est pas listée en direct" is_live
