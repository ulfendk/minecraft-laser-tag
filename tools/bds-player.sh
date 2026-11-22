#!/usr/bin/env bash
# Player test: a Bedrock Dedicated Server (Docker) with the add-on and a test-only pack
# (tools/player-test) whose simulated players put on vests and fire every laser gun at
# each other, as a kid would. The bots in the selftest can't do that: they fire from
# scripts, not by using an item. Simulated players need the Beta APIs experiment, so
# the world is made once, the experiment turned on in its level.dat, and started again.
# Usage: tools/bds-player.sh   (run `npm run build` first)
set -euo pipefail

cd "$(dirname "$0")/.."
NAME=lasertag-bds-player
DATA="$PWD/build/bds-player"
LEVEL=lasertag_player
IMAGE=${BDS_IMAGE:-itzg/minecraft-bedrock-server:latest}
TIMEOUT=${BDS_TIMEOUT:-600}

uuid() { node -e "console.log(require('$1/manifest.json').header.uuid)"; }
version() { node -e "console.log(JSON.stringify(require('$1/manifest.json').header.version))"; }

docker rm -f "$NAME" >/dev/null 2>&1 || true
rm -rf "$DATA"
mkdir -p "$DATA/behavior_packs" "$DATA/resource_packs" "$DATA/worlds/$LEVEL"
cp -R build/behavior_pack "$DATA/behavior_packs/lasertag_bp"
cp -R build/resource_pack "$DATA/resource_packs/lasertag_rp"
cp -R tools/player-test "$DATA/behavior_packs/lasertag_player_test"
echo "[{\"pack_id\":\"$(uuid ./build/behavior_pack)\",\"version\":$(version ./build/behavior_pack)},{\"pack_id\":\"$(uuid ./tools/player-test)\",\"version\":$(version ./tools/player-test)}]" > "$DATA/worlds/$LEVEL/world_behavior_packs.json"
echo "[{\"pack_id\":\"$(uuid ./build/resource_pack)\",\"version\":$(version ./build/resource_pack)}]" > "$DATA/worlds/$LEVEL/world_resource_packs.json"

docker run -d --name "$NAME" \
  -e EULA=TRUE \
  -e LEVEL_NAME="$LEVEL" \
  -e LEVEL_TYPE=FLAT \
  -e GAMEMODE=survival \
  -e CONTENT_LOG_FILE_ENABLED=true \
  -e CONTENT_LOG_CONSOLE_OUTPUT_ENABLED=true \
  -e CONTENT_LOG_LEVEL=info \
  -v "$DATA:/data" \
  "$IMAGE" >/dev/null

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

started() {
  local start
  start=$(date +%s)
  until [ "$(docker logs "$NAME" 2>&1 | grep -c "Server started")" -ge "$1" ]; do
    if (( $(date +%s) - start > TIMEOUT )); then
      docker logs "$NAME" 2>&1 | tail -50
      echo "Timed out waiting for server"; exit 1
    fi
    sleep 5
  done
}

echo "Making the world..."
started 1
docker stop "$NAME" >/dev/null
node tools/level-dat.mjs "$DATA/worlds/$LEVEL/level.dat"
docker start "$NAME" >/dev/null
echo "Starting again with Beta APIs..."
started 2

send() { docker exec -u 0 "$NAME" send-command "$@"; }
send tickingarea add circle 8 -60 20 4 lasertag_player true
sleep 20
send scriptevent lasertag:playertest
for _ in $(seq 240); do
  docker logs "$NAME" 2>&1 | grep -qE "\[Player test\] (PASS|FAIL)" && break
  sleep 2
done

LOG=$(docker logs "$NAME" 2>&1)
echo "$LOG" > "$DATA/server.log"
echo "$LOG" | grep -iE "player test|laser tag|error|\[Scripting\]" | tail -60 || true
echo "$LOG" | grep -q "\[Player test\] PASS" || { echo "FAIL: the player test did not pass"; exit 1; }
echo "PASS: simulated players fired every laser gun"
