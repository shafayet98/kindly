#!/usr/bin/env bash
# Starts a public HTTPS tunnel (Cloudflare quick tunnel) and the realtime server behind it,
# so Twilio can reach this machine during development.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${REALTIME_PORT:-8787}"
LOG="$(mktemp -t kindly-tunnel)"

cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT}" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null; rm -f "$LOG"' EXIT

for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "${URL:-}" ]; then
  echo "Could not start the tunnel. cloudflared output:" >&2
  cat "$LOG" >&2
  exit 1
fi

mkdir -p logs
echo "Public URL: $URL"
echo "Server log is also written to logs/realtime-dev.log"
PUBLIC_BASE_URL="$URL" npx tsx watch realtime-server/index.ts 2>&1 | tee -a logs/realtime-dev.log
