#!/usr/bin/env bash
set -euo pipefail

root="$RUNNER_TEMP/statichost-browser"
tool="$root/profiler/CompressionProfile.dll"
source="$root/source/comparison/comparison.json"
site="$root/site"
server_pid=""
stop_server() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid"
    wait "$server_pid" || true
  fi
  server_pid=""
}
trap stop_server EXIT

dotnet "$tool" subset "$root/frontend" "$source" "$site" \
  "$GITHUB_WORKSPACE/src/statichost/StaticHost"

for level in SmallestSize Optimal; do
  variant="$root/results/$level"
  mkdir -p "$variant"
  if [[ -d "$site/obj/Release/net10.0/compressed/publish" ]]; then
    if [[ "$(realpath "$site/obj/Release/net10.0/compressed/publish")" != "$site/obj/Release/net10.0/compressed/publish" ]]; then
      echo "Refusing to clean a redirected fixture compression directory." >&2
      exit 1
    fi
    rm -rf -- "$site/obj/Release/net10.0/compressed/publish"
  fi
  dotnet publish "$site/StaticHost.csproj" --configuration Release --output "$variant/publish" \
    -p:BrotliCompressionLevel="$level" 2>&1 | tee "$variant/publish.log"
  dotnet "$tool" describe "$variant/publish" "$variant/files.json"
  dotnet "$tool" serve "$variant/publish" http://127.0.0.1:4322 > "$variant/server.log" 2>&1 &
  server_pid=$!
  ready=false
  for attempt in $(seq 1 120); do
    if ! kill -0 "$server_pid" 2>/dev/null; then
      cat "$variant/server.log" >&2
      echo "Representative endpoint server exited before readiness." >&2
      exit 1
    fi
    if curl --fail --silent http://127.0.0.1:4322/__profile/stats > /dev/null; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    echo "Representative endpoint server did not become ready." >&2
    exit 1
  fi
  (
    cd "$GITHUB_WORKSPACE/src/frontend"
    node scripts/profile-static-host-compression.mjs run \
      http://127.0.0.1:4322 "$variant/files.json" "$level" "$variant/browser.json"
  )
  stop_server
done

(
  cd "$GITHUB_WORKSPACE/src/frontend"
  node scripts/profile-static-host-compression.mjs browser-report \
    "$root/results" "$source" "$GITHUB_STEP_SUMMARY"
)
